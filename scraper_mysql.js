'use strict';
const request = require('request-promise');
const promise = require('bluebird');
const cheerio = require('cheerio');
const tress = require('tress');

//var mysql      = require('mysql');
//var mysql = promise.promisifyAll(require('mysql'));
var mysql = require('promise-mysql');
var connection;
console.log('01');
mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : 'vjybnjh77',
    database : 'sysadm'
}).then(function(conn){
    console.log('02');
    connection = conn;
    return collectListToDB([{id:-1,name:'test',cnt:0,authorId:-1,authorName:'test'}]);
}).then(function(){
    console.log('03');
	return connection.end();
}).catch(function(error){
    //logs out the error
    console.log(error);
});
console.log('04');
//connection.connect();

function collectListToDB(collect){
	//Записываем список авторов
	var authors = collect.map(function(item){return [item.authorId, item.authorName]});
    return connection.query('INSERT IGNORE INTO authors (idauthor,name) values ?', [authors]).then(function(){
    	var collections = collect.map(function(item){return [item.id, item.name, item.authorId, item.cnt]});
        return connection.query('INSERT IGNORE INTO collections (idcollection,name,idauthor,cnt ) values ?', [collections]);
	}).then(function(){
		return connection.query('commit');
    });
	//Записываем список коллекций
	//Коммит
	/*
    var item = collect[0];
    var items = collect.map(function(item){
        var res = [item.id, item.name, item.authorId, item.cnt];
        return res;
    });
    //console.log(items[0]);
    return connection.query('INSERT IGNORE INTO collections (idcollection,name,idauthor,cnt ) values ?', [items]);*/
}



Object.defineProperty(global, '__stack', {
	get: function(){
		var orig = Error.prepareStackTrace;
		Error.prepareStackTrace = function(_, stack){ return stack; };
		var err = new Error;
		Error.captureStackTrace(err, arguments.callee);
		var stack = err.stack;
		Error.prepareStackTrace = orig;
		return stack;
	}
});

Object.defineProperty(global, '__line', {
	get: function(){
		return __stack[1].getLineNumber();
	}
});

function logerr(err){
    if (!!err){
        console.log(err);
		//console.log(__stack);
    };
}


function safeGet(match, index) {
    if (Array.isArray(match) && match.length > index &&
        typeof match[2] === 'string' && match[2].length > 0) {
        return match[index];
    }
    else {
        return null;
    }
};
/*
function collectListToDB(collect,callback){
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
	db.run('commit',logerr);
    callback();
}
/*
function collectListToDB(collect,callback1){
	console.log('collectListToDB');
	db.run('begin transaction',function(err){
		logerr(err);
		var stmt = db.prepare('REPLACE INTO collections (idcollection,name,idauthor,cnt ) values (?,?,?,?)',function(err) {
			async.each(collect,function (item,callback) {
				stmt.run([item.id, item.name, item.authorId, item.cnt], function(err){logerr(err); callback(err);});
			},function(err){
				logerr(err);
				stmt = db.prepare('REPLACE INTO authors (idauthor,name ) values (?,?)', logerr);
				async.each(collect,function (item,callback) {
					stmt.run([item.authorId, item.authorName], function(err){logerr(err); callback(err);});
				},function(err) {
					db.run('commit', function (err) {
						logerr(err);
						console.log('collectListToDB finished');
						callback1();
					});
				});
			});
		});
	});
}
*/
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
        db.run('commit',function(err){logerr(err);callback();});
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
		db.get('select count(bc.idbook) as cnt from books_collections bc where bc.idcollection = ?', [idCollection], function (err, row) {
			if (err) {
				reject(err);
			}else {
                if ((typeof row === 'object') && (row.cnt > 0 )) 
				{
					resolve(row.cnt);
				} else {resolve(0);}

			};
		});
	});
}

function processJob(job, done){
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
			if (result === job.item.cnt){
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
};

// create a queue object with worker and concurrency 1
var q = tress(processJob, 5);

q.drain = function(){
    console.log('db close');
    db.close;
	console.log('All finished');
};
/*
	if (process.argv[2]) {
		console.log('https://ficbook.net/collections/' + process.argv[2] + '/list');
		q.push({url: 'https://ficbook.net/collections/' + process.argv[2] + '/list', type: 'getCollectList'});
	} else {

console.log('https://ficbook.net/collections/' + process.env.MORPH_START_ID + '/list');
q.push({url: 'https://ficbook.net/collections/' + process.env.MORPH_START_ID + '/list', type: 'getCollectList'});

}
	*/

