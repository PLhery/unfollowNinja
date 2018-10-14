# Unfollow Ninja
https://unfollow.ninja
: Receive a direct message in a few seconds when someone unfollows you on Twitter

Version 2 - Still in development  
Version 1: https://github.com/PLhery/unfollowNinja/tree/legacy

![Screenshot](http://i.imgur.com/rRsa7iy.jpg)

## Install

- clone the repo `git clone git@github.com:PLhery/unfollowNinja.git`
- `cd unfollowNinja/unfollowNinja-server`
- install the dependencies `npm install`
- create a .env file (see [.env file](#.env-file))
- launch the workers `node ./dist/api/workers`
- launch the api server `node ./dist/api`
- or launch both in the as a daemon with pm2 `pm2 start pm2.yml`

If you made some changes to the code, you can launch a new instance before exiting the former one to prevent downtime.

Logs are saved in the 'logs' folder.

You can also launch the kue dashboaord to monitor tasks with `npm run kue-ui`

## .env file
You can create a .env in unfollowNinja-server to set some parameters:
```
CONSUMER_KEY=xxx
CONSUMER_SECRET=xxx
DM_CONSUMER_KEY=xxx
DM_CONSUMER_SECRET=xxx

# optionally:
CLUSTER_SIZE=2 #Number of workers, defaults to number of CPUs
WORKER_RATE_LIMIT=15 #Number of unique tasks managed at the same time, defaults to 15
BETA_USERS=unfollowninja #List of usernames that have access to beta features
MINUTES_BETWEEN_CHECKS=2 #Number of minutes between every followers check
API_PORT=2000 # port that the API server should listen to
API_BASE_URL=http://localhost:2000/ # API base url
API_SESSION_SECRET=session_secret # a string use to secure API sessions
AUTH_REDIRECT=http://localhost:8080/ # URL called after a succesful auth
```

You can also set these parameters as environment variables.

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

## TODO

currently : followers are checked for everyone, DM are sent to beta users

  - add an API / an https server
  - link that https server to the former UI
  - develop a static landing page with some explanation
  - develop a one-page react (or vue) page to manage preferences / see unfollowers.
  
## Contribute

Open an issue with your suggestions or assign yourself to an existing issue

### Translate the app to your language

- Fork the project
- copy unfollowNinja-server/en.json to youLanguageCode.json
- fill translations
- change line 3 of unfollowNinja-server/src/utils/types.ts and add your language code
- commit and submit a pull request

[License](./LICENSE.md) (ISC)