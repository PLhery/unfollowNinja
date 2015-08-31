var config = {};

config.URL =  "https://unfollowninja.fr/"; //L'url publique de votre site
config.port = 8080; //Le port sur lequel l'app doit écouter

config.mongoDB = "mongodb://localhost/ninja"; //base de donnée mongoDB à utiliser

config.sessionSecret = "This is my funky secret oh my god it has ninja turtles"; //Ecrivez ce que vous voulez, permet d'eviter une session hijacking

/*Votre app de connection :
Créez une app sur dev.twitter.com, avec juste les droits en lecture, et en callback_URL https://LESITE.COM/step1/auth/callback
Notez votre token et secret
*/
config.twitter = {
    consumerKey: "quelque chose comme omFv9HSvyfsegNmGFE6sdSJq0",
    consumerSecret: "quelque chose comme G7fEJCFGQyW1sd9Dj6Jw9qo8HdZH9V6pDz57T8nugSuZslvhd0"
};
/*Votre app d'envoi de DM :
 Créez une app sur dev.twitter.com, avec tous les droits (lecture, ecriture, DM), et en callback_URL https://LESITE.COM/step2/auth/callback
 Notez votre token et secret
 */
config.twitterDM = {
    consumerKey: "quelque chose comme omFv9HSvyfsegNmGFE6sdSJq0",
    consumerSecret: "quelque chose comme G7fEJCFGQyW1sd9Dj6Jw9qo8HdZH9V6pDz57T8nugSuZslvhd0"
};

module.exports = config;