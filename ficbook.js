'use strict';
//require('v8-profiler');
const request = require('request-promise');
const promise = require('bluebird');
const cheerio = require('cheerio');
const tress = require('tress');

//const mysql      = require('mysql');
//var mysql = promise.promisifyAll(require('mysql'));
/*
const connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : 'vjybnjh77',
  database : 'sysadm'
});

connection.connect();
*/

function logerr(err){
    if (!!err){
        console.log(err);
    };
}

const sqlite = require('sqlite3').verbose();
const db = new sqlite.Database('data.db');
db.exec(`
CREATE TABLE if not exists authors (
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
`, logerr);


function safeGet(match, index) {
    if (Array.isArray(match) && match.length > index &&
        typeof match[2] === 'string' && match[2].length > 0) {
        return match[index];
    }
    else {
        return null;
    }
}

function collectListToDB(collect){
	console.log('collectListToDB');
    db.run('begin transaction',logerr);
    var stmt = db.prepare('REPLACE INTO collections (idcollection,name,idauthor,cnt ) values (?,?,?,?)',logerr);
    collect.forEach(function(item){
        stmt.run([item.id, item.name, item.authorId, item.cnt],logerr);
    });
    stmt = db.prepare('REPLACE INTO authors (idauthor,name ) values (?,?)',logerr);
    collect.forEach(function(item){
        stmt.run([item.authorId, item.authorName],logerr);
    });
    db.serialize(function(){
        db.run('commit',logerr);
    });
}

function collectDataToDB(collect, collectId,callback){
	console.log('collectDataToDB '+collectId);
    db.run('begin transaction',logerr);
	db.run('DELETE FROM books_collections where idcollection = ?', [collectId],function(err) {
        logerr(err);
        var stmt = db.prepare('REPLACE INTO books (idbook,name,idauthor,card ) values (?,?,?,?)',logerr);
        collect.forEach(function(item){
            stmt.run([item.id, item.name, item.authorId, item.card],logerr);
        });

        stmt = db.prepare('REPLACE INTO authors (idauthor,name ) values (?,?)',logerr);
        collect.forEach(function(item){
            stmt.run([item.authorId, item.authorName],logerr);
        });

        stmt = db.prepare('REPLACE INTO books_collections ( idcollection,idbook ) values (?,?)',logerr);
        collect.forEach(function(item){
            stmt.run([collectId, item.id],logerr);
        });
        db.serialize(function(){
            db.run('commit',logerr);
        });
	});
}

function getCollectList(url){
    return request({url: url})
    .then(function (body) {
    	console.log(url + ' loaded')
        const $=cheerio.load(body);
        var list = $('div.collection-thumb');  //collection-thumb js-item-wrapper
        var results = [];
        for(var item = list.first();item.length>0;item=item.next()){
        	var result={};
        	result.name = item.children('div.collection-thumb-info').children('a').text();
        	if (!result.name){
        		continue;
        	}
        	result.url = item.children('div.collection-thumb-info').children('a').attr('href');
        	result.id = parseFloat(result.url.match(/(\d+)/)[1]);
        	var p = item.children('div.collection-thumb-info').contents();
        	//result.cnt = [];
        	p.each(function (i, tag){ 
        		if (typeof tag.data === 'string') {
	        		var re=tag.data.match(/\((\d+)\)/);
	        		if (Array.isArray(re)){
	        		  result.cnt=parseFloat(re[1]);
	        		  return false;
	        		}         		
        		}
        	});
        	result.authorName = item.children('div.collection-thumb-author').children('a').text();
        	result.authorUrl = item.children('div.collection-thumb-author').children('a').attr('href');
        	result.authorId = parseFloat(result.authorUrl.match(/(\d+)/)[1]);
        	//result.cnt = item.children('div.collection-thumb-info')[0];
        	//nextSibling
        	results.push(result);
        };
        //return promise.resolve(results);
        return results;
    })
}

function getCollectData(url,results){
	return request({url: url})
	.then(function (body) {
		console.log(url + ' loaded')
	        const $=cheerio.load(body);
            $._options.decodeEntities = false;
            if (!Array.isArray(results)){
	        	results = [];
	        };
	        var list = $('section.fanfic-thumb-block')
	        for(var tag = list.first();tag.length>0;tag=tag.next()){
	        	var item = tag.find('div.description');
	        	var result = {};
	        	result.name = item.children('h3').children('a').text();
	        	result.url = item.children('h3').children('a').attr('href');
	        	if (!result.url) {
	        	  continue;
	        	}
	        	result.id = parseFloat(result.url.match(/(\d+)/)[1]);
	        	if (result.id !==result.id) {
	        	  console.log(result);
	        	  continue;
	        	}

	        	result.authorName = item.children('ul').children('li').children('a').text().replace(/\n/g,'');
	        	result.authorUrl = item.children('ul').children('li').children('a').attr('href');
	        	result.authorId = parseFloat(result.authorUrl.match(/(\d+)/)[1]);
				result.card = tag.html();
	        	results.push(result);
	        };
	        var newUrl=$('.pagination');
	        newUrl=newUrl.find('i.icon-arrow-right').parent();
	        newUrl=newUrl.attr('href');
	        if (!!newUrl && !!newUrl.match(/collection.*p=\d+/)){		
		        return getCollectData('https://ficbook.net'+newUrl,results);
		} else {
		        return results;
		}
	})
}

function getCollectionCount(idCollection){
	return new Promise(function(resolve, reject) {
		db.run('select count(bc.idbook) as cnt from books_collections bc where bc.idcollection = ?', [idCollection], function (err, rows) {
			if (err) {
				reject(err);
			}else {
				if (Array.isArray(rows) && rows.length > 0 )
				{
					resolve(rows[0].cnt);
				} else {resolve(0);}

			};
		});
	});
}

// create a queue object with worker and concurrency 1
var q = tress(function(job, done){
	if (job.type==='getCollectList') {
		getCollectList(job.url).then(function(result){
			console.log(job.url+' parced');
			result.map(function(item,i){q.push({url:'https://ficbook.net'+item.url,item:item,type:'getCollectData',index:i});})
			q.unshift({result:result,type:'collectListToDB'});
			console.log('Job '+job.type+' finished');
            done(null);
		});
	};
	if (job.type==='getCollectData') {
		getCollectionCount(job.item.id).then(function(result){
			if (false) { //(result === job.item.cnt){
				console.log('Collection '+ job.item.name + ' ('+ job.item.id +') already loaded');
				done(null);
			} else {
				getCollectData(job.url).then(function(result){
					console.log(job.url+' parced '+job.index);
					q.unshift({result:result,id:job.item.id,type:'collectDataToDB'});
					console.log('Job '+job.type+' finished');
					done(null);
				});
			}
		})
	};
	if (job.type==='collectListToDB') {
		collectListToDB(job.result,function(){console.log('Job '+job.type+' finished');done(null)});
	}
	if (job.type==='collectDataToDB') {
		collectDataToDB(job.result, job.id,function(){console.log('Job '+job.type+' finished');done(null)});
	}	
}, 5);

q.drain = function(){
    console.log('All finished');
    //connection.end();
    db.close;
};

if (process.argv[3]) {
	getCollectionCount(process.argv[3]).then(function (result){console.log(result)});
} else {
	if (process.argv[2]) {
		console.log('https://ficbook.net/collections/' + process.argv[2] + '/list');
		q.push({url: 'https://ficbook.net/collections/' + process.argv[2] + '/list', type: 'getCollectList'});
	}
}
