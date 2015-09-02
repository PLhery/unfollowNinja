var Twitter = require('twitter');
var _ = require("underscore");
var moment = require('moment');
moment.locale('fr');

module.exports = function(config, User) {

    bots = {}; //Liste des bots, associés à un ID d'user
    var self=this;

    //D'abord, on charge les bots déja existants
    User.find(function (err, users) {
        if (err) return console.error(err);

        users.forEach(function(user) {
            self.updateUser(user);
        });
    });

    function Bot(user) { //Objet Bot
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
            if(user.twitterDM.id) {
                var allFollowers=[]; //liste d'IDs des followers à récupérer
                var oldFollowers=_.pluck(user.followers, 'id'); //liste d'IDs des followers dans la BDD
                var attente;

                client.get('followers/ids', {user_id: user.twitter.id, stringify_ids:true}, function getData(err, data, response) { //On charge une page de 5000 followers
                    if (data && data.ids && data.ids.length>0) {
                        allFollowers = allFollowers.concat(data.ids);

                        if (data['next_cursor'] > 0) { //si + de 5000 followers -plusieurs pages
                            account.client.get('followers/ids', { user_id: account.row.twitterId, cursor: data['next_cursor_str']}, getData);
                        } else{ ///Quand on a tout (et qu'on a bien des followers)

                            //on traite les UNFOLLOWERS
                            var unfollowers = _.difference(oldFollowers, allFollowers);

                            if (unfollowers.length > 0) {
                                sendUnfollows(unfollowers.slice(0, 5).join(", ")); //on envoie max 5 DMs max/minute pour éviter les enormes spam
                            }

                            //on traite les NOUVEAUX FOLLOWERS
                            var newFollowers = _.difference(allFollowers, oldFollowers);

                            if(newFollowers.length>0) {
                                if(user.followers.length==0) { //Cas d'un nouveau compte
                                    newFollowers.forEach(function(follower) {
                                        user.followers.push({id:follower, since:0});
                                    });
                                    try { //Si on est sur unfollowninja on lance le module birdyImport pour importer les dates de follow de l'ancienne version
                                        require('./birdyImport')(user);
                                    } catch (e) { if (e.code != "MODULE_NOT_FOUND")  throw e; }

                                } else {
                                    newFollowers.forEach(function (follower) { //on les ajoute à la liste des followers
                                        user.followers.push({id: follower});
                                    });
                                }
                                user.save();
                            }

                            attente = (parseInt(response.headers["x-rate-limit-reset"]) - Math.floor(Date.now() / 1000)) / (parseInt(response.headers["x-rate-limit-remaining"]) + 1);
                            timeOut = setTimeout(self.checkUnfollow, (attente + 1) * 1000);
                        }
                    }
                    else { //en cas d'erreur (rate limit ?) On attend
                        var attente=60*15; //attente par défaut : 15min
                        var errorName="";
                        if(err && err[0] && err[0].code==89)
                            errorName="tokens expirés";
                        else if("x-rate-limit-reset" in response.headers) {
                            errorName="rate limit";
                            attente = response.headers["x-rate-limit-reset"] - Math.floor(Date.now() / 1000);
                        }
                        else {
                            console.log(err);
                            errorName = "erreur inconnue";
                        }
                        console.log(errorName+" sur " + user.twitter.username +" : on patiente " + attente / 60 + " minutes");
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
            client.get('users/lookup', {user_id: unfollowersList}, function getData(err, data, response) { //on récupère les usernames etc de ces twittos
                if (data && !data.error && data[0]) {
                    data.forEach(function (twittos) {
                        var DBfollower = user.getFollower(twittos.id_str);
                        if (DBfollower.index > -1) {
                            sendDM(twittos, user, DBfollower.twittos, function () {//1 - On envoie un DM pour prévenir de l'unfollow
                                user.unfollowers.push(DBfollower.twittos); //2 - si le DM est bien recu, on l'ajoute à la liste des unfollowers
                                user.followers[DBfollower.index].remove(); //3 - et on le supprime des followers pour par avoir de nouveau la notif.
                                user.save();
                            });
                        }
                    });
                }
            });
        }

        /**
         * Envoi les DMs d'unfollow
         * @param twittos l'objet twitter de l'unfollower
         * @param user le compte sur lequel l'unfollow est pris en charge
         * @param DBtwittos l'info sur le follower venant de la BDD
         * @param callback fonction à appeller si le DM est envoyé avec succès/que l'erreur va durer longtemps !
         */
        function sendDM(twittos, user, DBtwittos, callback) {
            console.log("@"+user.twitter.username+" a été unfollow, envoi du DM par @"+user.twitterDM.username+" :");
            var follower = user.getFollower(twittos.id_str);

            var message = "@" + twittos.screen_name + " vous a unfollow :/... Il vous suivait avant votre inscription à unfollowNinja.";
            if(follower.twittos.since.getTime()>0) {
                var since = moment(follower.twittos.since);
                message = "@" + twittos.screen_name + " vous a unfollow :/... Il vous a suivi pendant " + since.toNow(true) + ' (' + since.calendar() + ')';
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
                                    console.log("erreur - message en double. Une nouvelle tentative aura lieu.");
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
                                default:
                                    console.log("erreur "+error[0].code+" - "+error[0].message+". Une nouvelle tentative aura lieu.");
                            }
                        } else {
                            console.log("une erreur inconnue a eu lieu. Une nouvelle tentative aura lieu.");
                        }
                    }
                    else
                        callback();
                });
        }

        this.remove = function() {
            if(timeOut)
                clearTimeOut(timeOut);
            console.log("J'arrête de checker les followers de "+("@"+user.twitter.username).blue+" .");
            delete bots[user._id];
        };


        console.log("Hop, je check les followers de "+("@"+user.twitter.username).cyan+" !");
        this.checkUnfollow();

        /* getters - setters*/
        this.getUser = function() {
            return user;
        };
        this.setUser = function(newUser) {
            user = newUser;
        };
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
};