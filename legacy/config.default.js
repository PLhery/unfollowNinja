var config = {};

config.URL =  "https://unfollowninja.fr/"; //L'url publique de votre site (ex http://127.0.0.1:8080/ )
config.port = 8080; //Le port sur lequel l'app doit écouter

config.mongoDB = "mongodb://localhost/ninja"; //base de donnée mongoDB à utiliser

config.sessionSecret = "This is my funky secret oh my god it has ninja turtles"; //Ecrivez ce que vous voulez, permet d'eviter une session hijacking

/*Votre app de connection :
Créez une app sur dev.twitter.com > manage your apps, avec juste les droits en lecture, et en callback_URL https://LESITE.COM/step1/auth/callback
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


/*Mise en cache :
 * Activer la mise en cache des utilisateurs. Cela met en cache les usernames de tous les followers pour les retrouver en cas de suspension (dans la collection "caches")*/

config.cache = true;

/* Identifiants pour "scanner" tous les users en cache*/

config.twitterCache = { //NinjaSender1
    consumer_key: config.twitterDM.consumerKey,
    consumer_secret: config.twitterDM.consumerSecret,
    access_token_key: "quelque chose comme 1234567899-mKCra2fdsJfp0c3ApGqVVMSG1N8iH0uvRmDGhF9i",
    access_token_secret: "quelque chose comme lRYW9f7bgGScytdfSVim0edvPGjxpXzZ8z3BkHS6Ooch8"
};

/* Nombre d'utilisateurs max à scanner/jour (permet d'economiser des ressources) - 0 = illimité = environ 1.5 millions */
config.maxUsersDay = 300000;

/*limite de DM à envoyer par unité de temps : */
config.limite = 10; //10 DMs MAX
config.limitePar = 24; //par période de 24h glissante

module.exports = config;