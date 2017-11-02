/**
 * Created by Дима on 08.03.2017.
 */
'use strict';
const promise = require('bluebird');
const express = require('express');
const app = express();

const sqlite = require('sqlite-async');
var db;

async function initDb() {
    db = await sqlite.open('data.sqlite');
    start();
};


function start(){
    console.log('ficbook.net helper started');
    app.listen(8085);
}

app.get('/test', test);
app.get('/testPage', testPage);
//app.get('/testQuery',testQueryAsync);
app.get('/testQuery',rs_1);

initDb();

async function rs_1(req,res){
    var rows = await db.all(`
    select b.name name, b.idbook idBook, b.card card, count(*) cnt, sum(100/c.cnt) cnt_w1
    from
    books b inner join
    (collections c inner join
    (books_collections bc1 inner join
    books_collections bc on
    bc1.idcollection=bc.idcollection)
    on c.idcollection=bc.idcollection)
    on b.idbook = bc.idbook
    where bc1.idbook=?
    group by bc.idbook
    order by cnt_w1 desc 
    limit 20   
    `, [req.query.idBook]);
    var books=rows.reduce(function(previousValue, currentItem, index, arr){
        if (currentItem.card === null){
            return previousValue + '<section class="fanfic-thumb-block"><a href="/readfic/' + currentItem.idBook.toString()+'">'+currentItem.name + '</a></section>';;
        } else {
            return previousValue + '<section class="fanfic-thumb-block">' + currentItem.card + '</section>';
        }
    },'');
        res.send(
            `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css?family=Open+Sans:400,300,700,400italic&subset=latin,cyrillic,cyrillic-ext,latin-ext' rel='stylesheet' type='text/css'>
    <title>Сборники</title>
    <link rel="stylesheet" href="https://teinon.net/ficbook/css/all-d07d1650.css">
    <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
    <link rel="icon" type="image/png" href="/favicon-16x16.png" sizes="16x16">
    <link rel="manifest" href="/manifest.json">
    <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5">
    <meta name="theme-color" content="#ffffff">
    <base href="https://ficbook.net/">
</head>
<body>
<div id="wrapper">
    <div class="container">
        <div class="row row-main">
            <div class="col-lg-16 main-container">
                <div class="w1">
                    <div class="book-container">
                        <div class="book-corner-left-top hidden-xs"></div>
                        <div class="book-corner-right-top hidden-xs"></div>
                        <div class="book-corner-right-bottom hidden-xs"></div>
                        <div class="book-corner-left-bottom hidden-xs"></div>
                        <div class="book-stiches-top hidden-xs"></div>
                        <div class="book-stiches-left hidden-xs"></div>
                        <div class="book-stiches-right hidden-xs"></div>
                        <div class="book-stiches-bottom hidden-xs"></div>
                        <div class="book-inner">
                            <div class="pages-left1"></div>
                            <div class="pages-left2"></div>
                            <div class="pages-left3"></div>
                            <div class="pages-left4"></div>
                            <div class="pages-left5"></div>
                            <div class="pages-right1"></div>
                            <div class="pages-right2"></div>
                            <div class="pages-right3"></div>
                            <div class="pages-right4"></div>
                            <div class="pages-right5"></div>

                            <main id="main" role="main">
                                <div class="main-holder alt">
                                    <section class="content-section">`
                                        +books+
                                    `</section>
                                </div>
                            </main>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</body>
</html>`
            );
}

async function testQueryAsync(req, res) {
    var row = await db.get('select count(bc.idbook) as cnt from books_collections bc where bc.idcollection = ?', [req.query.idCollection]);
    res.send('cnt ' + row.cnt);
}

function testQuery(req, res){
    testQueryAsync(req, res);
}

function test(req, res){
    res.send('ok');
}

function testPage(req, res){
    res.send(
`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css?family=Open+Sans:400,300,700,400italic&subset=latin,cyrillic,cyrillic-ext,latin-ext' rel='stylesheet' type='text/css'>
    <title>Сборники</title>
    <link rel="stylesheet" href="https://teinon.net/ficbook/css/all-d07d1650.css">
    <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
    <link rel="icon" type="image/png" href="/favicon-16x16.png" sizes="16x16">
    <link rel="manifest" href="/manifest.json">
    <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5">
    <meta name="theme-color" content="#ffffff">
</head>
<body>
<div id="wrapper">
    <div class="container">
        <div class="row row-main">
            <div class="col-lg-16 main-container">
                <div class="w1">
                    <div class="book-container">
                        <div class="book-corner-left-top hidden-xs"></div>
                        <div class="book-corner-right-top hidden-xs"></div>
                        <div class="book-corner-right-bottom hidden-xs"></div>
                        <div class="book-corner-left-bottom hidden-xs"></div>
                        <div class="book-stiches-top hidden-xs"></div>
                        <div class="book-stiches-left hidden-xs"></div>
                        <div class="book-stiches-right hidden-xs"></div>
                        <div class="book-stiches-bottom hidden-xs"></div>
                        <div class="book-inner">
                            <div class="pages-left1"></div>
                            <div class="pages-left2"></div>
                            <div class="pages-left3"></div>
                            <div class="pages-left4"></div>
                            <div class="pages-left5"></div>
                            <div class="pages-right1"></div>
                            <div class="pages-right2"></div>
                            <div class="pages-right3"></div>
                            <div class="pages-right4"></div>
                            <div class="pages-right5"></div>

                            <main id="main" role="main">
                                <div class="main-holder alt">
                                    <section class="content-section">
                                        <section class="fanfic-thumb-block">
                                            <div class="js-item-wrapper">
                                            </div>
                                        </section>
                                    </section>
                                </div>
                            </main>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</body>
</html>`
    );
}
