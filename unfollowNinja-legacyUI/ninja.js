#!/usr/bin/env node

require("colors");
console.log(("Unfollow NINJAAA".trap+" - le serv' (legacy)\n\n").yellow);

//On charge la config
try {
    var config = require('./config');
} catch(e) {

    console.error("Modifiez le fichier de configuration config.default.js et renommez-le config.js".red.bgWhite);
    console.log("emplacement : "+__dirname);
    if(e.code!='MODULE_NOT_FOUND')
        console.log(e);
    console.log("\n");
    process.exit(e.code);
}

const request = require('request').defaults({jar: true});
//Implémentation d'express et ses plugins (gère la partie web)
var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));
app.use(require('compression')()); //compresse les données en gzip
app.use(require('morgan')('tiny')); //affiche les logs de connection dans la console
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.set('views', __dirname + '/views');

let users = {};

//Vérifie qu'on est sur le bon domaine, sinon on redirige !
app.get('/*', function(req, res, next) {
    var currentURL = (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host') + "/";
    if(currentURL!=config.URL) {
        console.log("accès par "+currentURL.underline+" au lieu de "+config.URL.underline);
        res.redirect(config.URL);
    } else
        next();
});

function toLayout(res) { //Permet d'afficher les pages dans le layout
    return function(err, html) {
        res.render('layout.ejs', {content: html});
    };
}

function getNinjaInfos(req, res, next) {
    const jar = request.jar();
    if(!req.cookies['connect.sid']) {
        req.ninjaInfos = {};
        return next();
    }
    const cookie = request.cookie('connect.sid=' + req.cookies['connect.sid']);
    jar.setCookie(cookie, config.API_URL);

    request({url: config.API_URL + "v1/infos", jar}, (error, response, body) => {
        req.ninjaInfos = JSON.parse(body);
        next();
    });
}

app.get('/', getNinjaInfos, function(req, res) {
    if (!req.ninjaInfos.id) {
        return res.render('step1.ejs', toLayout(res));
    }
    if (!req.ninjaInfos.dmId) {
        return res.render('step2.ejs', req.ninjaInfos, toLayout(res));
    }
    res.render('step3.ejs', req.ninjaInfos, toLayout(res));
});


app.get('/step1/auth', function(req, res, next) {
    res.redirect(config.API_URL + "v1/auth");
});

app.get('/step2/auth', function(req, res, next) {
    res.redirect(config.API_URL + "v1/auth-dm-app");
});

app.get('/step2/disable', function(req, res){
    if(req.get("referer") && req.get("referer").indexOf(config.URL) === 0) { //Si on vient bien du site (contre une XSRF)
        const jar = request.jar();
        if(!req.cookies['connect.sid']) {
            req.ninjaInfos = {};
            return res.redirect("/");
        }
        const cookie = request.cookie('connect.sid=' + req.cookies['connect.sid']);
        jar.setCookie(cookie, config.API_URL);

        request({url: config.API_URL + "v1/remove-dm-app", jar}, (error, response, body) => {
            req.ninjaInfos = body;
            res.redirect("/");
        });
    }
});



//Définition de la page 404
app.use(function(req, res, next){
    res.setHeader('Content-Type', 'text/plain');
    res.status(404).send('Page introuvable !');
});

//On lance le serveur web.
app.listen(config.port, function () {
    console.log("Yo, j'écoute le port " + config.port.toString().underline);
}).on('error', function(err) {
    if(err.code = "EACCESS") {
        console.error(("Une erreur est survenue : le port "+config.port+" déja utilisée, changez de port !").red.bgWhite+"\n\n");
        process.exit(err.code);
    }
    throw err;
});