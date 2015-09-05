# unfollowNinja
Code d' https://unfollowninja.fr - service web ecrit en nodeJS pour détecter vos unfollows et vous envoyer un DM

![Screenshot du site](http://i.imgur.com/rRsa7iy.jpg "Screenshot du site")

## Motivation
Contribuez à ajouter des fonctionnalités au site, ou adaptez-le à vos besoins !

Forkez simplement ce git, faites vos améliorations (mineures, e.g meilleure gestion des erreurs, comme majeur, e.g mettre en cache les usernames pour détecter les comptes désactivés), et proposez-moi vos pull request !

Si je le trouve inadapté au site, je ferai quand même de la pub pour votre fork ;)

## License
Le code est proposé sous licences BSD-3 (cf license.txt), vous pouvez donc le modifier à votre sauce, notamment le layout, mais gardez un lien vers la license, et l'attribution (partie droite du footer) !
## Installation
d'abord, installez nodejs si ce n'est pas fait `sudo apt-get install nodeJS mongodb` puis :

1 - installez globalement
`sudo npm install -g unfollowninja`
puis tapez `ninja` pour lancer le serveur

ou

2 - installez localement
`npm install unfollowninja`
puis `cd node_modules/unfollowninja/`
enfin tapez `node ninja` pour lancer le serveur.

Pour le laisser tourner en tâche de fond, j'utilise `PM2` + `keymetrics`, vous pouvez aussi utiliser `screen` ou `forever`.

## Usage

Suivez juste les indications, vous devrez créer un fichier de configuration config.js, pas de panique, il est commenté !

![Screenshot de la console](http://i.imgur.com/McDmGx4.png "Screenshot de la console")

Si vous voulez manager vos utilisateurs, je vous conseil [humongous.io](https://humongous.io)

![Screenshot d'humangous.io](http://i.imgur.com/to4AAw5.png "Screenshot d'humangous.io")

ma configuration (de gauche à droite) : twitter.photo, twitter.username, followers.length, unfollowers.length, twitterDM.photo, twitterDM.username.
## Contribution
1. Forkez le projet !
2. Creez votre branche avec votre feature: `git checkout -b my-new-feature`
3. Commitez vos changements: `git commit -am 'Add some feature'`
4. Pushez le dans votre branche: `git push origin my-new-feature`
5. Envoyez-moi un pull request :D

## History
1.0.14 - version initiale