#!/usr/bin/env node

var pmx = require('pmx').init();//monitoring avec pm2 + keymetrics
require("colors");
console.log(("Unfollow NINJAAA".trap+" - le serv'\n\n").yellow);

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

var _ = require("underscore"); //set d'outils

//déclaration des schémas et modèles de mongoose (gestion de mongoDB)
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
mongoose.connect(config.mongoDB);
var twitterUser={id:String, username:String, photo:String, token:String, secret:String};
var userSchema = new Schema({ username: String, twitter: twitterUser, twitterDM: twitterUser, followers: [{id: String, since:{ type: Date, default: Date.now }}], unfollowers: [{id: String, since: Date, until:{ type: Date, default: Date.now }}] });
userSchema.methods.getFollower = function (id) { //Trouve un follower par son ID
    i = _.findIndex(this.followers, { id: id });
    return {
        index : i,
        twittos : this.followers[i]
    }
};
var User = mongoose.model('user', userSchema);

//Implémentation du detecteur d'unfollow ninjaDetect
var detect = new (require('./ninjaDetect'))(config, User);

//Implémentation d'express et ses plugins (gère la partie web)
var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));
app.use(require('compression')()); //compresse les données en gzip
app.use(require('morgan')('tiny')); //affiche les logs de connection dans la console
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: config.sessionSecret, resave: true, saveUninitialized: true }));
app.set('views', __dirname + '/views');

//Implémentation de passport et son plugin twitter (gère la connection)
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
app.use(passport.initialize());
app.use(passport.session());

//Gestion de la connection etape 1
passport.use('twitter-step1', new TwitterStrategy({ consumerKey: config.twitter.consumerKey, consumerSecret: config.twitter.consumerSecret, callbackURL: config.URL+"step1/auth/callback"},
    function(token, tokenSecret, profile, done) {
        User.update({"twitter.id": profile.id}, {twitter: {id: profile.id, username: profile.username, photo: profile.photos[0].value, token: token, secret: tokenSecret} }, { upsert:true }, function(err, raw){
            if(err)
                console.log(err);
            User.findOne({"twitter.id": profile.id}, function(err, user) {
                detect.updateUser(user);
                done(err, user);
            });
        });
    }
));

//Gestion de la connection etape 2
passport.use('twitter-step2', new TwitterStrategy({consumerKey: config.twitterDM.consumerKey, consumerSecret: config.twitterDM.consumerSecret, callbackURL: config.URL+"step2/auth/callback"},
    function(token, tokenSecret, profile, done) {
        profile.token=token;
        profile.secret=tokenSecret;
        done(null, profile);
    }
));

//Indique à passport qu'on utilisera mongoose pour stocker les infos utilisateur
passport.serializeUser(function(user, done) {
    done(null, user._id);
});
passport.deserializeUser(function(id, done) {
    User.findById(id, done);
});


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




//Que fait chaque paaaage...
app.get('/', function(req, res) {
    res.render('step1.ejs', toLayout(res));
});
app.get('/step1/auth', function(req, res, next) {
    passport.authenticate('twitter-step1', function(err, user, info) {
        if(err) {
            console.error("Une erreur est survenue : #01 vérifiez les tokens/secret de l'app de connexion ! ".red.bgWhite);
            res.send("Une erreur est survenue #01 ! Si vous êtes administrateur du site, vérifiez la console !");
        }
    })(req, res, next);
});


app.get('/step1/auth/callback',
    passport.authenticate('twitter-step1', { failureRedirect: '/' }), function(req, res) {
        req.session.user = req.user._id;
        res.redirect('/step2');
    });

app.get('/step2/', function(req, res) {
    if(req.user) { //Si on est bien connecté
        if(req.user.twitterDM.id) { //Si on en est déja à l'étape 3
            res.render('step3.ejs',  req.user , toLayout(res));
        } else {
            res.render('step2.ejs', req.user, toLayout(res));
        }
    } else {
        res.redirect('/');
    }
});

app.get('/step2/auth', function(req, res, next) {
    passport.authenticate('twitter-step2', function(err, user, info) {
        if(err) {
            console.error("Une erreur est survenue : #02 vérifiez les tokens/secret de l'app d'envoi de DM ! ".red.bgWhite);
            res.send("Une erreur est survenue #02 ! Si vous êtes administrateur du site, vérifiez la console !");
        }
    })(req, res, next);
});

app.get('/step2/auth/callback',
    passport.authenticate('twitter-step2', { failureRedirect: '/step1/', session: false }), function(req, res) {
        if(req.user.id && req.session.user) {
            User.update({"_id": req.session.user}, {twitterDM: {id: req.user.id, username: req.user.username, photo: req.user.photos[0].value, token: req.user.token, secret: req.user.secret}}, function (err, raw) {
                if (err)
                    console.log(err);
                detect.updateUser(req.session.user);
                res.redirect('/step2');
            });
        } else {
            res.redirect('/step2');
        }
    });

app.get('/step2/disable', function(req, res){
    if(req.session.user && req.get("referer") && req.get("referer").indexOf(config.URL+"step2") === 0) { //Si on vient bien du site (contre une XSRF)
        User.update({"_id": req.session.user}, {twitterDM: null}, function (err, raw) {
            if (err)
                console.log(err);
            detect.updateUser(req.session.user);
            res.redirect('/step2');
        });
    } else {
        res.redirect("/step2");
    }
});

try { //Si on est sur unfollowninja, on ajoute le /gift pour donateurs et utilisateurs fidèles
    require('./ninjaPlus')(app, toLayout, mongoose, User, detect);
} catch (e) { if (e.code != "MODULE_NOT_FOUND")  throw e; }

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
        console.error(("Une erreur est survenue : le port "+config.port+" déja utilisé ou est reservé à root, lancez donc l'appli en tant que root ou changez de port !").red.bgWhite+"\n\n");
        process.exit(err.code);
    }
    throw err;
});


//Ajout d'indicateurs à keymetrics
var probe = pmx.probe();
probe.metric({ //Nombre de comptes actifs
    name    : 'Comptes actifs',
    value   : function() {
        return detect.getNumberofActiveUsers();
    }
});

//Je ne sais pas pourquoi, avec la dernière version de node/iojs, le garbage collector n'est jamais appelé..
if (global.gc) {
    console.log("Garbage Collector activé !");
    setInterval(global.gc, 30000);
}