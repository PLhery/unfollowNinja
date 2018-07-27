# Unfollow Ninja
https://unfollow.ninja
: Receive a direct message in a few seconds when someone unfollows you on Twitter

Version 2 - Still in development  
Version 1: https://github.com/PLhery/unfollowNinja/tree/legacy

![Screenshot](http://i.imgur.com/rRsa7iy.jpg)

## Motivation behind V2

TL;DR: Less bugs and faster notifications

Initially, the legacy server checked the list of followers every 3 mins to detect an unfollow. With >2400 users, >1 500 000 follow relationship, there were performance issues. Because of these, I reduced the check to 1 every 10 minutes.

The main goal of this update is to be able to do 1 check every one or two minutes and be able to welcome more users.

- Based on a job queue for:
    - Monitoring: I can see how much job/sec is happening, their errors, and rate limit them.
    - Scalability: Everything was happening in one thread in one server. If a queue is full I can add a vcore and a worker thread.
    - Atomicity: When the server restart, wait for every atomic job to finish instead of interupting them. (causing messages not sent or sent twice)
    - Reliability: If a job fails, prepare better retry strategies.
    - Uptime: Possibility to scale on two servers. If one server is down, the second one is still working.
- Use Typescript to make code more bug-proof and clearer for contributors
- Split the webserver from the worker: When the worker was busy, the webserver was slow because all was happening in the same thread.
- Use redis for improved db performance
- I18n
- Use twitter's SnowFlake IDs to get the exact follow time
- New UI with more explanation (SEO + people didn't get they had to click on the (1))


## Install

- clone the repo `git clone git@github.com:PLhery/unfollowNinja.git`
- `cd unfollowNinja/unfollowNinja-server`
- install the dependencies `npm install`
- create a .env file with these params: CONSUMER_KEY, CONSUMER_SECRET (and optionally CLUSTER_SIZE, KUE_APP_PORT, WORKER_RATE_LIMIT)
- launch the program `npm start`

Logs are saved in the 'logs' folder.

## Contribute

Open an issue with your suggestions or assign yourself to an existing issue

## History
1.x.x - corrections de bugs cf commits  
1.2.0 - Corrections de bugs, Mise en cache de twittos, API /!\ mettez à jour config.js  
1.1.0 - optimisations mémoire  
1.0.0-19 - corrections de bugs cf commits  
1.0.0 - version initiale

[License](./LICENSE.md) (ISC)