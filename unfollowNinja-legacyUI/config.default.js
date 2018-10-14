var config = {};

config.URL =  "https://unfollowninja.fr/"; //L'url publique de votre site (ex http://127.0.0.1:8080/ )
config.API_URL =  "http://localhost:2000/"; //L'url de l'API
config.port = 8080; //Le port sur lequel l'app doit écouter

config.sessionSecret = "This is my funky secret oh my god it has ninja turtles"; //Ecrivez ce que vous voulez, permet d'eviter une session hijacking

module.exports = config;