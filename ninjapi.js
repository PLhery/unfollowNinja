/**
 * Created by paul- on 31/10/2015.
 */
var _ = require("lodash");
var moment = require('moment');
moment.locale('fr');

module.exports = function(express, ripemd, User, Cache) {

    function connect(username, apikey, callback) {
        if(/[^a-zA-Z0-9]_/.test( username ) || /[^a-zA-Z0-9]/.test( apikey )) {
            callback(false);
        } else {

            User.findOne({"twitter.username": username}, function (err, user) {
                if (err || !user || apikey!=ripemd(user.twitter.token).toString().substring(0, 35))
                    callback(false);
                else
                    callback(user);
            });

        }
    }

    var API = express.Router(); //Routeur de l'API

    API.get('/', function(req, res) {
        res.json({ message: 'Houra ! vous êtes bien sur la ninjAPI !', help:'Essayez /API/VotreUsername/VotreAPIKey/unfollow[/nombre(10 par défaut]' });
    });

    API.get('/:username/:apikey/', function(req, res) {
        connect(req.params.username,req.params.apikey, function(user) {
            if(user)
                res.json({message: 'Vous êtes bien connecté à l\'API !'});
            else
                res.json({error: 'Identifiants incorrects'});
        });

    })

        .get("/:username/:apikey/unfollow/:nombre?.:format?", function(req, res) {
            var nombre=(req.params.nombre)?req.params.nombre:10;

            connect(req.params.username,req.params.apikey, function(user) {
                if(user) {

                    var userUnfollowers= user.unfollowers.reverse().slice(0,nombre);

                    Cache.find({
                        'twitterId': { $in: _.map(userUnfollowers, 'id')}
                    }, function (err, docs) {
                        if (!err) {
                            var unfollows=[];

                            userUnfollowers.forEach(function(item) {
                                var unfollower={};

                                unfollower.user={
                                    twitterID: item.id
                                };

                                var twittosInfo = _.find(docs, {twitterId: item.id});
                                if(twittosInfo) {
                                    unfollower.user.username=twittosInfo.username;
                                    unfollower.user.profilePic=twittosInfo.profilePicture;
                                }
                                var since = moment(item.since);
                                unfollower.followDate = {
                                    timestamp:+since,
                                    date:since,
                                    human: since.calendar(),
                                    since: since.toNow(true)
                                };

                                var until = moment(item.until);
                                unfollower.unfollowDate = {
                                    timestamp:+until,
                                    date:until,
                                    human: until.calendar(),
                                    since: until.toNow(true)
                                };

                                unfollower.duration = {
                                    timestamp:item.until-item.since,
                                    human: moment.duration(item.until-item.since).humanize()
                                };


                                unfollows.push(unfollower);

                            });
                            res.type('json').send(JSON.stringify(unfollows, null, 2));
                        }
                        else {
                            console.error(err);
                            res.status(500).json({ error: 'Aie, une erreur inconnue est survenue :/'});
                        }
                    });


                }
                else
                    res.json({error: 'Identifiants incorrects'});
            });
        })

        .get("/:username/:apikey/:request", function(req, res, next){
            res.status(404).json({ error: 'Requete inexistante', help:'Essayez /API/VotreUsername/VotreAPIKey/unfollow[/nombre(10 par défaut]' });
        });



    API.use(function(req, res, next){
        res.status(404).json({ error: 'Mauvaise requete', help:'Une requete doit commencer par /API/VotreUsername/VotreAPIKey/ !' });
    });

    return API;
};

