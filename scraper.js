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
    console.log('collectListToDB');
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

async function collectDataToDB(collect, collectId) {
    console.log('collectDataToDB ' + collectId);
    await tryBeginTransaction(db);
    await clearCollectionData(collectId);

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

async function tryBeginTransaction(db,maxTryes) {
    maxTryes = maxTryes & 1000;
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
            console.log('loops '+endlessLoopBreak);
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
        if (item.authorId >0) {
            return stmt.run([item.authorId, item.authorName]);
        } else {
            console.log(item.authorUrl);
        }
    }));
    await stmt.finalize();

    stmt = await db.prepare('replace into books_collections ( idcollection,idbook ) values (?,?)');
    await Promise.all(collect.map(function (item) {
        return stmt.run([collectId, item.id]);
    }));
    await stmt.finalize();

    try {
        await db.run('commit');
    } catch (e) {
        console.log(e);
    }
}


async function getCollectList(url) {
    var body = await request({url: url});
    console.log(url + ' loaded');
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
        results.push(result);
    }
    return results;
}

async function getCollectData(url, results) {
    var body = await request({url: url});
    console.log(url + ' loaded');
    const $ = cheerio.load(body);
    $._options.decodeEntities = false;
    if (!Array.isArray(results)) {
        results = [];
    }
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
    var newUrl = $('.pagination');
    newUrl = newUrl.find('i.icon-arrow-right').parent();
    newUrl = newUrl.attr('href');
    if (!isEmpty && !!newUrl && !!newUrl.match(/collection.*p=\d+/)) {
        return getCollectData('https://ficbook.net' + newUrl, results);
    } else {
        return results;
    }
}

async function getCollectDataPage(url) {
    var body = await request({url: url});
    console.log(url + ' loaded');
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
    if ((typeof row === 'object') && (row.cnt > 0 )) {
        return (row.cnt);
    } else {
        console.log(row);
        return (0);
    }
}

async function processJobAsync(job) {
    if (job.type === 'getCollectList') {
        var collections = await getCollectList(job.url);
        console.log(job.url + ' parced');
        //чтобы кинуть задачу в список и забыть
        q.unshift({result: collections, type: 'collectListToDB'});
        //получаем данные по коллекциям из БД
/*        for(var i=0;i<collections.length;i++){
            collections[i].cntDB = await getCollectionCount(collections[i].id);
        }*/
        await Promise.all(collections.map(function(item,i){
            return async function(){collections[i].cntDB = await getCollectionCount(collections[i].id)}()
        }));

        //для каждой коллекции:
        await Promise.all(
        collections.map(function(item){
        return async function (item) {
            // проверить нужно ли ее загружать
            console.log('item.cnt %s item.cntDB %s',item.cnt,item.cntDB);
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
                    console.log('pushed getCollectDataPage '+'https://ficbook.net'+item.url+'?p='+i)
                    q.push({url:'https://ficbook.net'+item.url+'?p='+i,item:item,type:'getCollectDataPage'});
                }
                //параллельно генерить структуру для статистики и подсчета оставшегося времени
            }
        }(item)}));
    } else if (job.type === 'getCollectDataPage') {
        var collection = await getCollectDataPage(job.url);
        console.log(job.url + ' parced ' + job.index);
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

    console.log('Job ' + job.type + ' finished');
}

function processJob1(job, done) {
    processJobAsync(job).then(
        function(){
            console.log('done ' + job.type);
            done(null);
        }
        ).catch(function (err) {
            throw err;
    });
}


function processJob(job, done) {
    if (job.type === 'getCollectList') {
        getCollectList(job.url).then(function (result) {
            console.log(job.url + ' parced');
            //result.map(function(item,i){q.push({url:'https://ficbook.net'+item.url,item:item,type:'getCollectData',index:i});})
            q.unshift({result: result, type: 'collectListToDB'});
            console.log('Job ' + job.type + ' finished');
            done(null);
        });
    }
    if (job.type === 'getCollectData') {
        getCollectionCount(job.item.id).then(function (result) {
            if (result === job.item.cnt) {
                console.log('Collection ' + job.item.name + ' (' + job.item.id + ') already loaded');
                done(null);
            } else {
                getCollectData(job.url).then(function (result) {
                    console.log(job.url + ' parced ' + job.index);
                    q.unshift({result: result, id: job.item.id, type: 'collectDataToDB'});
                    console.log('Job ' + job.type + ' finished');
                    done(null);
                });
            }
        })
    }
    if (job.type === 'collectListToDB') {
        //collectListToDB(job.result,function(){console.log('Job '+job.type+' finished');done(null)});
        collectListToDB(job.result).then(function () {
            console.log('Job ' + job.type + ' finished');
            done(null)
        });
    }
    if (job.type === 'collectDataToDB') {
        collectDataToDB(job.result, job.id).then(function () {
            console.log('Job ' + job.type + ' finished');
            done(null)
        });
    }
}
// create a queue object with worker and concurrency 1
var q = tress(processJob1, 5);
q.push({type: 'connect'});

q.drain = function () {
    console.log(q.running());
    console.log('db close');
    db.close().then( _ =>console.log('All finished') );
};

if (process.argv[2]) {
    console.log('https://ficbook.net/collections/' + process.argv[2] + '/list');
    q.push({url: 'https://ficbook.net/collections/' + process.argv[2] + '/list', type: 'getCollectList'});
}
