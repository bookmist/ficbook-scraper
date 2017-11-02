'use strict';
const request = require('request-promise');
const promise = require('bluebird');
const cheerio = require('cheerio');
const tress = require('tress');

function logerr(err) {
    if (!!err) {
        console.log(err);
    }
}

const sqlite = require('sqlite-async');
var db;

async function initDb() {
    db = await sqlite.open('data.sqlite');
    await db.exec(
`CREATE TABLE if not exists authors (
  idauthor int(11) NOT NULL,
  name varchar(500) DEFAULT NULL,
  PRIMARY KEY (idauthor)
);

CREATE TABLE if not exists books (
  idbook int(11) NOT NULL,
  name varchar(500) DEFAULT NULL,
  idauthor int(11) DEFAULT NULL,
  plus int(11) DEFAULT NULL,
  card text,
  PRIMARY KEY (idbook)
) ;

CREATE TABLE if not exists books_collections (
  idbook int(11) NOT NULL,
  idcollection int(11) NOT NULL,
  PRIMARY KEY (idbook,idcollection)
);

CREATE TABLE if not exists collections (
  idcollection int(11) NOT NULL,
  name varchar(500) DEFAULT NULL,
  idauthor int(11) DEFAULT NULL,
  cnt int(11) DEFAULT NULL,
  PRIMARY KEY (idcollection)
);

CREATE INDEX IF NOT EXISTS i_BOOKS_COLLECTIONS_COLLECTION ON
BOOKS_COLLECTIONS ( IDCOLLECTION );

PRAGMA journal_mode = MEMORY;
`);
}

function safeGet(match, index) {
    if (Array.isArray(match) && match.length > index &&
        typeof match[2] === 'string' && match[2].length > 0) {
        return match[index];
    }
    else {
        return null;
    }
}
async function collectListToDB(collect) {
    await tryBeginTransaction(db);
    await dbExecList(db,'REPLACE INTO collections (idcollection,name,idauthor,cnt ) values (?,?,?,?)',
        collect.map(item => [item.id, item.name, item.authorId, item.cnt])
    );
    await dbExecList(db,'REPLACE INTO authors (idauthor,name ) values (?,?)',
        collect.map(item => [item.authorId, item.authorName]));
    await db.run('commit');
}

async function clearCollectionData(collectId) {
    await db.run('DELETE FROM books_collections where idcollection = ?', [collectId]);
}

async function dbExecList(db, statement, params) {
    await db.run('SAVEPOINT Q5GIYOa7I0eNxGHJOPWmEQ');
    var stmt = await db.prepare(statement);
    await Promise.all(params.map(function (item) {
        return stmt.run(item);
    }));
    await stmt.finalize();
    await db.run('RELEASE SAVEPOINT Q5GIYOa7I0eNxGHJOPWmEQ');
}

async function tryBeginTransaction(db,maxTryes) {
    if (!maxTryes){
        maxTryes = 10000;
    }
    var endlessLoopBreak=0;
    do {
        var ok=true;
        try {
            await db.run('begin transaction');
        } catch (e) {
            if (e.errno===1 && e.code==='SQLITE_ERROR') {
                ok=false;
            } else {
                throw e;
            }
        }
        if (ok){
            //console.log('loops '+endlessLoopBreak);
            break;
        }
        endlessLoopBreak++;
    } while (endlessLoopBreak<maxTryes);
}

async function collectDataToDBPage(collect, collectId) {
    await tryBeginTransaction(db);

    var stmt = await db.prepare('replace into books (idbook,name,idauthor,card ) values (?,?,?,?)');
    await Promise.all(collect.map(function (item) {
        return stmt.run([item.id, item.name, item.authorId, item.card]);
    }));
    await stmt.finalize();

    stmt = await db.prepare('replace into authors (idauthor,name ) values (?,?)');
    await Promise.all(collect.map(function (item) {
        return stmt.run([item.authorId, item.authorName]);
    }));
    await stmt.finalize();

    stmt = await db.prepare('replace into books_collections ( idcollection,idbook ) values (?,?)');
    await Promise.all(collect.map(function (item) {
        return stmt.run([collectId, item.id]);
    }));
    await stmt.finalize();

    await db.run('commit');
}


async function getCollectList(url) {
    var body = await request({url: url});
    const $ = cheerio.load(body);
    var list = $('div.collection-thumb');  //collection-thumb js-item-wrapper
    var results = [];
    for (var item = list.first(); item.length > 0; item = item.next()) {
        var result = {};
        result.name = item.children('div.collection-thumb-info').children('a').text();
        if (!result.name) {
            continue;
        }
        result.url = item.children('div.collection-thumb-info').children('a').attr('href');
        result.id = parseFloat(result.url.match(/(\d+)/)[1]);
        var p = item.children('div.collection-thumb-info').contents();
        p.each(function (i, tag) {
            if (typeof tag.data === 'string') {
                var re = tag.data.match(/\((\d+)\)/);
                if (Array.isArray(re)) {
                    result.cnt = parseFloat(re[1]);
                    return false;
                }
            }
        });
        result.authorName = item.children('div.collection-thumb-author').children('a').text();
        result.authorUrl = item.children('div.collection-thumb-author').children('a').attr('href');
        result.authorId = parseFloat(result.authorUrl.match(/(\d+)/)[1]);
        if (!(result.authorId >0)) {
            console.error('Не распознан ид автора из урла '+result.authorUrl);
        }

        results.push(result);
    }
    return results;
}

async function getCollectDataPage(url) {
    var body = await request({url: url});
    const $ = cheerio.load(body);
    $._options.decodeEntities = false;
    var results = [];
    var list = $('section.fanfic-thumb-block');
    var isEmpty = 1;
    for (var tag = list.first(); tag.length > 0; tag = tag.next()) {
        var item = tag.find('div.description');
        var result = {};
        result.name = item.children('h3').children('a').text();
        result.url = item.children('h3').children('a').attr('href');
        if (!result.url) {
            continue;
        }
        result.id = parseFloat(result.url.match(/(\d+)/)[1]);
        if (result.id !== result.id) {
            console.log(result);
            continue;
        }

        result.authorName = item.children('ul').children('li').children('a').text().replace(/\n/g, '');
        result.authorUrl = item.children('ul').children('li').children('a').attr('href');
        result.authorId = parseFloat(result.authorUrl.match(/(\d+)/)[1]);
        result.card = tag.html();
        results.push(result);
        isEmpty = 0;
    }
    return results;
}

async function getCollectionCount(idCollection) {
    var row = await db.get('select count(bc.idbook) as cnt from books_collections bc where bc.idcollection = ?', [idCollection]);
    if ((typeof row === 'object') && (row.cnt >= 0 )) {
        return (row.cnt);
    } else {
        console.error('getCollectionCount Ошибка распознавания результата. row='+JSON.stringify(row));
        return (0);
    }
}

async function processJobAsync(job) {
    if (job.type === 'getCollectList') {
        var collections = await getCollectList(job.url);
        //чтобы кинуть задачу в список и забыть
        q.unshift({result: collections, type: 'collectListToDB'});
        //получаем данные по коллекциям из БД
        await Promise.all(collections.map(function(item,i){
            return async function(){collections[i].cntDB = await getCollectionCount(collections[i].id)}()
        }));

        //для каждой коллекции:
        await Promise.all(
        collections.map(function(item){
        return async function (item) {
            // проверить нужно ли ее загружать
            if (item.cnt === item.cntDB){
                console.log('collection %s (%s) already loaded',item.name,item.id);
            } else {
                // если нужно, то
                // подсчитать кол-во страниц
                item.pages = Math.ceil(item.cnt / 20);
                // зачистить коллекцию в базе
                await clearCollectionData(item.id);
                // сгенерить задачи на загрузку страниц
                for (var i = 1;i<=item.pages;i++){
                    q.push({url:'https://ficbook.net'+item.url+'?p='+i,item:item,type:'getCollectDataPage'});
                }
                //параллельно генерить структуру для статистики и подсчета оставшегося времени
            }
        }(item)}));
    } else if (job.type === 'getCollectDataPage') {
        var collection = await getCollectDataPage(job.url);
        q.unshift({result: collection, id: job.item.id, type: 'collectDataToDBPage'});
    } else

    if (job.type === 'collectListToDB') {
        await collectListToDB(job.result);
    } else
    if (job.type === 'collectDataToDBPage') {
        await collectDataToDBPage(job.result, job.id);
    } else if(job.type === 'connect'){
        await initDb();
    } else {
        console.error('Unhandled job ' + job.type );
    }
    console.log('Осталось %d задач',q.length());

}

function processJob(job, done) {
    processJobAsync(job).then(
        function(){
            done(null);
        }
        ).catch(function (err) {
            console.log(job.type);
            console.error(err);
            throw err;
    });
}

// create a queue object with worker and concurrency 1
var q = tress(processJob, 5);
q.push({type: 'connect'});

q.drain = function () {
    console.log('db close');
    db.close().then( _ =>console.log('All finished') );
};

if (process.argv[2]) {
    console.log('https://ficbook.net/collections/' + process.argv[2] + '/list');
    q.push({url: 'https://ficbook.net/collections/' + process.argv[2] + '/list', type: 'getCollectList'});
}
