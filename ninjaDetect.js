var Twitter = require('twitter');
var _ = require("underscore");
var moment = require('moment');
moment.locale('fr');

module.exports = function(config, User, Cache) {


    bots = {}; //Liste des bots, associés à un ID d'user
    var self=this;

    //D'abord, on charge les bots déja existants

    const per_page=60;
    function loadBots(page) { //On charge les bots page par page pour economiser la RAM
        console.log("chargement des bots - page "+page);
        User.find().select("_id twitter twitterDM followers.id").skip((page - 1) * per_page).limit(per_page).exec(function (err, users) {
            if (err) return console.error(err);

            users.forEach(function (user) {
                self.updateUser(user);
            });
            if(users[per_page-1])
                loadBots(page+1);
        });
    }
    loadBots(1);

    function Bot(user) { //Objet Bot
        var userObj={};
        var timeOut;
        var self=this;

        var client = new Twitter({
            consumer_key: config.twitter.consumerKey,
            consumer_secret: config.twitter.consumerSecret,
            access_token_key: user.twitter.token,
            access_token_secret: user.twitter.secret
        });


        /**
         * Vérifie les unfollows, appellé toutes les minutes environ (suivant la limitation de twitter -> le nombre de requetes à faire -> la taille du compte )
         */
        this.checkUnfollow = function() {
            if(userObj.twitterDM.id) {
                var allFollowers=[]; //liste d'IDs des followers à récupérer
                var oldFollowers= userObj.followers; //liste d'IDs des followers dans la BDD
                var attente;

                client.get('followers/ids', {user_id: userObj.twitter.id, stringify_ids:true}, function getData(err, data, response) { //On charge une page de 5000 followers
                    if (data && data.ids && data.ids.length>0) {
                        allFollowers = allFollowers.concat(data.ids);

                        if (data['next_cursor'] > 0) { //si + de 5000 followers -plusieurs pages
                            client.get('followers/ids', { user_id: userObj.twitter.id, stringify_ids:true, cursor: data['next_cursor_str']}, getData);
                        } else{ ///Quand on a tout (et qu'on a bien des followers)

                            //on traite les UNFOLLOWERS
                            var unfollowers = _.difference(oldFollowers, allFollowers);

                            if (unfollowers.length > 0) {
                                sendUnfollows(_.uniq(unfollowers.slice(0, 3)).join(",")); //on envoie max 10 DMs max/minute pour éviter les enormes spam
                            }

                            //on traite les NOUVEAUX FOLLOWERS
                            var newFollowers = _.difference(allFollowers, oldFollowers);

                            if(newFollowers.length>0) {
                                self.getUser(function(user) { //On recupere l'utilisateur
                                    if (user.followers.length == 0) { //Cas d'un nouveau compte
                                        newFollowers.forEach(function (follower) {
                                            user.followers.push({id: follower, since: 0});
                                            (new Cache({ twitterId: follower })).save();
                                        });
                                        try { //Si on est sur unfollowninja on lance le module birdyImport pour importer les dates de follow de l'ancienne version
                                            require('./birdyImport')(user);
                                        } catch (e) {
                                            if (e.code != "MODULE_NOT_FOUND")  throw e;
                                        }

                                    } else {
                                        newFollowers.forEach(function (follower) { //on les ajoute à la liste des followers
                                            user.followers.push({id: follower});
                                            (new Cache({ twitterId: follower })).save();
                                        });
                                    }
                                    user.save(function (err) { if (err) console.log(err); });
                                    self.setUser(user);
                                });
                            }

                            attente = (parseInt(response.headers["x-rate-limit-reset"]) - Math.floor(Date.now() / 1000)) / (parseInt(response.headers["x-rate-limit-remaining"]) + 1);
                            if(attente<180) attente=180;
                            timeOut = setTimeout(self.checkUnfollow, (attente + 1) * 1000);
                        }
                    }
                    else { //en cas d'erreur (rate limit ?) On attend
                        var attente=60*15; //attente par défaut : 15min
                        var errorName="";
                        if(err && err[0] && err[0].code==89)
                            errorName="tokens expirés";
                        else if(response && "x-rate-limit-reset" in response.headers) {
                            errorName="rate limit";
                            attente = response.headers["x-rate-limit-reset"] - Math.floor(Date.now() / 1000);
                        }
                        else {
                            console.log(err);
                            errorName = "erreur inconnue";
                        }
                        console.log(errorName+" sur " + userObj.twitter.username +" : on patiente " + attente / 60 + " minutes");
                        timeOut = setTimeout(self.checkUnfollow, (attente + 1) * 1000);
                    }

                });
            }
        };


        /**
         * Récupère les infos (username) sur les twittos à unfollow en lance l'envoi de DM
         * @param unfollowersList la liste des unfollowers à traiter
         */ 
        function sendUnfollows(unfollowersList) {
            var allUsers = unfollowersList.split(",");

            client.get('users/lookup', {user_id: unfollowersList}, function getData(err, data, response) { //on récupère les usernames etc de ces twittos
                self.getUser(function(user) {
                    var nbTreated = 0;
                    var aliveUsers = [];
                    if (data && !data.error && data[0]) {
                    //On récupère l'utilisateur complet
                        data.forEach(function (twittos) {
                            aliveUsers.push(twittos.id_str);
                            var DBfollower = user.getFollower(twittos.id_str);
                            if (DBfollower.index > -1) {
                                sendDM(twittos, user, DBfollower.twittos, function () {//1 - On envoie un DM pour prévenir de l'unfollow
                                    user.unfollowers.push(DBfollower.twittos); //2 - si le DM est bien recu, on l'ajoute à la liste des unfollowers
                                    if(DBfollower.index in user.followers)
                                        user.followers[DBfollower.index].remove(); //3 - et on le supprime des followers pour par avoir de nouveau la notif.
                                },function() {
                                    nbTreated++; //Si on les a tous traité
                                    if(allUsers.length==nbTreated) {
                                        //console.log("saving "+user.twitter.username);
                                        user.save(function (err) {if (err) console.log(err);});
                                        self.setUser(user);
                                    }
                                });
                            }
                        });

                    }

                    var deadUsers=_.difference(allUsers, aliveUsers);


                    if(deadUsers[0]) { //Les utilisateurs morts (désactivés etc...), on simule l'unfollow sans DM
                        deadUsers.forEach(function (userIdStr) {
                            console.log("Un utilisateur a disparu des abonnés de @" + userObj.twitter.username);
                            var DBfollower = user.getFollower(userIdStr);
                            if (DBfollower && DBfollower.twittos) {
                                Cache.where({ twitterId: userIdStr }).findOne(function (err, twittosDb) {
                                    if (twittosDb && twittosDb.username) { //s'il existe en cache
                                        var twittos = {
                                            screen_name: twittosDb.username,
                                            id_str:twittosDb.twitterId,
                                            suspended:true
                                        };
                                        sendDM(twittos, user, DBfollower.twittos, function() {//1 - On envoie un DM pour prévenir de l'unfollow
                                            user.unfollowers.push(DBfollower.twittos); //2 - si le DM est bien recu, on l'ajoute à la liste des unfollowers
                                            if(DBfollower.index in user.followers)
                                                user.followers[DBfollower.index].remove(); //3 - et on le supprime des followers pour par avoir de nouveau la notif.
                                        }, function() {
                                            nbTreated++; //Si on les a tous traité
                                            if(allUsers.length==nbTreated) {
                                                //console.log("saving "+user.twitter.username);
                                                user.save(function (err) {if (err) console.log(err);});
                                                self.setUser(user);
                                            }
                                        });

                                    } else { //Sinon on l'enlève des followers
                                        user.unfollowers.push(DBfollower.twittos);
                                        if (DBfollower.index in user.followers)
                                            user.followers[DBfollower.index].remove();

                                        nbTreated++; //Si on les a tous traité

                                        if(allUsers.length==nbTreated) {
                                            //console.log("saving "+user.twitter.username);
                                            user.save(function (err) {if (err) console.log(err);});
                                            self.setUser(user);
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            });
        }

        /**
         * Envoi les DMs d'unfollow
         * @param twittos l'objet twitter de l'unfollower
         * @param user le compte sur lequel l'unfollow est pris en charge
         * @param DBtwittos l'info sur le follower venant de la BDD
         * @param callback fonction à appeller si le DM est envoyé avec succès/que l'erreur va durer longtemps !
         */
        function sendDM(twittos, user, DBtwittos, callback, done) {


            if(user.unfollowers && user.unfollowers.length>=config.limite) {
                var temps = (Date.now()-user.unfollowers[user.unfollowers.length - config.limite].until)/60/60/1000; //Temps en heure depuis l'avant avant... dernier unfollow
                console.log(temps);
                if(temps<config.limitePar) {
                    console.log("Limite atteinte pour @"+user.twitter.username);
                    setTimeout(function() {
                        callback();
                        done();
                    },1000);
                    return;
                }
            }


            console.log("@"+user.twitter.username+" a été unfollow, envoi du DM par @"+user.twitterDM.username+" :");

            var follower = user.getFollower(twittos.id_str);

            var etat = " vous a unfollow :/...";
            if(twittos.suspended)
                etat = " a disparu de twitter !";

            var message = "@" + twittos.screen_name + etat +" Il vous suivait avant votre inscription à unfollowNinja.";
            if(follower.twittos && follower.twittos.since.getTime()>0) {
                var since = moment(follower.twittos.since);
                message = "@" + twittos.screen_name + etat +" Il vous a suivi pendant " + since.toNow(true) + ' (' + since.calendar() + ')';
            }
            console.log(message.yellow);


            new Twitter({
                consumer_key: config.twitterDM.consumerKey,
                consumer_secret: config.twitterDM.consumerSecret,
                access_token_key: user.twitterDM.token,
                access_token_secret: user.twitterDM.secret
            }).post('direct_messages/new', {user_id: user.twitter.id, text: message},  function(error, tweet, response){
                    if(error) {
                        if(error[0]) {
                            switch(error[0].code) {
                                case 151:
                                    console.log("erreur - message en double. Le DM ne sera pas réenvoyé.");
                                    callback();
                                    break;
                                case 64:
                                    console.log("erreur - compte suspendu. Le DM ne sera pas envoyé.");
                                    callback();
                                    break;
                                case 88:
                                    console.log("erreur - twitter-limite atteinte. Une nouvelle tentative aura lieu.");
                                    break;
                                case 89:
                                    console.log("erreur - tokens du compte de DM invalides. Le DM ne sera pas envoyé.");
                                    callback();
                                    break;
                                case 130:
                                    console.log("erreur - twitter over capacity. Une nouvelle tentative aura lieu.");
                                    break;
                                case 150:
                                    console.log("erreur - le twittos ne suit pas le DMeur. Une nouvelle tentative aura lieu.");
                                    WarnTwittos(user);
                                    break;
                                case 226:
                                    console.log("erreur - Pour twitter, ce message ("+message+") est peut etre un SPAM.. On va pas insister, tant pis :/...");
                                    callback();
                                    break;
                                case 261:
                                    console.log("L'application est bloquée en ecriture par twitter. Bye bye :/");
                                    throw new Error("L'application est bloquée en ecriture par twitter. Bye bye :/");
                                    break;
                                default:
                                    console.log("erreur "+error[0].code+" - "+error[0].message+". Une nouvelle tentative aura lieu.");
                            }
                        } else {
                            console.log("une erreur inconnue a eu lieu. Une nouvelle tentative aura lieu.");
                        }
                    }
                    else
                        callback();
                    done();
                });
        }

        function WarnTwittos(user) {

            new Twitter({
                consumer_key: config.twitterDM.consumerKey,
                consumer_secret: config.twitterDM.consumerSecret,
                access_token_key: user.twitterDM.token,
                access_token_secret: user.twitterDM.secret
            }).post('statuses/update', {status: "@"+user.twitter.username+" Bonjour, tu t'es fait unfollow, mais je n'ai pas pu t'envoyer de DM. Suis moi pour que je puisse !  - @Unfollow_Ninja"},  function(error, tweet, response) {
                    if(error) {
                        if(error[0]) {
                            if(error[0].code==151)
                                console.log("problème lors de la mention : status en double.");
                            else
                                console.log("problème lors de la mention  : "+error[0].code+" - "+error[0].message+".");
                        } else {
                            console.log("une erreur inconnue a eu lieu. Une nouvelle tentative aura lieu.");
                        }
                    }
                    else
                        console.log("mention d'alerte envoyée !");
                });
        }

        this.remove = function() {
            if(timeOut)
                clearTimeout(timeOut);
            console.log("J'arrête de checker les followers de "+("@"+userObj.twitter.username).blue+" .");
            delete bots[userObj._id];
        };





        /* getters - setters*/
        this.getUser = function(callback) {
            User.findOne({"_id": userObj._id}, function(err, user) {
                if(user)
                    callback(user);
                else
                    console.log("utilisateur introuvable - "+userObj.twitter.username);
            });
        };
        this.setUser = function(newUser) {
            newUser=newUser.toObject(); //on garde le strict minimum (optimisation memoire)
            delete newUser.unfollowers;
            newUser.followers = _.pluck(newUser.followers, 'id'); //sous la forme [unnumero, unnumero, unnumero].. Plus econome
            userObj = newUser;
        };

        this.setUser(user);
        user=null;



        console.log("Hop, je check les followers de "+("@"+userObj.twitter.username).cyan+" !");
        this.checkUnfollow();
    }


    /**
     * Actualise l'état des bots
     * @param user l'objet User qui a pu changer, ou son ID.
     */
    this.updateUser = function(user) {
        if((typeof user) == "string") { //Si l'entrée est juste l'ID
            User.findOne({"_id": user}, function(err, user) {
                if(user)
                    self.updateUser(user);
            });
        } else {
            if (user._id in bots) {
                if (user.twitterDM.id) {
                    console.log("dm");
                    bots[user._id].setUser(user);
                } else {
                    bots[user._id].remove();
                }
            } else if (user.twitterDM.id) {
                bots[user._id] = new Bot(user);
            }
        }
    };


    /* getters - setters*/
    this.getNumberofActiveUsers = function() {
        return _.size(bots);
    };
};