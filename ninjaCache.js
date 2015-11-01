var _ = require("underscore");
var Twitter = require('twitter');
var Async = require('async');



module.exports = function(config , Cache) {
console.log("[NINJACACHE] Lancement de la mise en cache...");

    var client = new Twitter(config.twitterCache); //Le client twitter qu'on va utiliser pour mettre à jour le cache

    function actualiserCache() {
        //console.log("actualisation...");
        Cache.find().limit(100).sort({'updatedAt': 1}).exec(function (err, users) {
            if (err) return console.error("[NINJACACHE]"+err[0]);

            client.get('users/lookup', {user_id: _.pluck(users, 'twitterId').join(",")}, function getData(err, data, response) { //on récupère les usernames etc de ces twittos
                if (err && err[0].code==215) return console.error("[NINJACACHE]"+"La mise en cache est desactivee - les jetons d'acces incorrects.");
                if (err) return console.error("[NINJACACHE]"+err);

                if (data && !data.error && data[0]) {
                    Async.eachSeries(data, function (twittos, callback) {

                            var index = _.findIndex(users, {twitterId: twittos.id_str});
                            twittosDb = users[index];

                            twittosDb.suspended=false;
                            twittosDb.username = twittos.screen_name;
                            twittosDb.profilePicture = twittos.profile_image_url_https;
                            twittosDb.updatedAt = Date.now();
                            twittosDb.save(function (err) {
                                if (err) console.log("[NINJACACHE]"+err);

                                users.splice(index, 1); //on l'enlève des users
                                callback();
                            });
                            //console.log("saving @" + twittos.screen_name + " ...");
                        },
                        function () {

                            //On traite ceux qui restent (qui sont suspendus)

                            users.forEach(function(twittosDb) {
                                twittosDb.suspended=true;
                                twittosDb.updatedAt = Date.now();
                                twittosDb.save();

                                //console.log("suspended @" + twittosDb.username + " ...");
                            });

                            attente = (parseInt(response.headers["x-rate-limit-reset"]) - Math.floor(Date.now() / 1000)) / (parseInt(response.headers["x-rate-limit-remaining"]) + 1);
                            attente= (config.maxUsersDay<=0 || attente>(24*3600*100/config.maxUsersDay))?attente:(24*3600*100/config.maxUsersDay);
                            //console.log(attente);
                            setTimeout(actualiserCache, attente*1000);
                        }
                    );

                }
            });

        });
    }
    actualiserCache();

};