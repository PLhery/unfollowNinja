# Unfollow Ninja [![Server CI status](https://github.com/PLhery/unfollowNinja/workflows/Server%20CI/badge.svg)](https://github.com/PLhery/unfollowNinja/actions?query=workflow%3A%22Server+CI%22)

https://unfollow.ninja
: Receive a notification when someone unfollows you on Twitter

![Screenshot](https://raw.githubusercontent.com/PLhery/unfollowNinja/master/unfollow-ninja-ui/public/preview.png)

---
Feel free to reuse the UI on a personal server, but please don't reuse the name/logo on a public instance.

Indeed, this software is under apache v2 license which means:

- You need to aknowledge the use of this software and its license somewhere
- A modified version can't have the same name

## Build the UI

- clone the repo `git clone git@github.com:PLhery/unfollowNinja.git`
- `cd unfollowNinja/unfollow-ninja-ui`
- change `api.unfollow.ninja` to you own server endpoints in App.js
- `npm install && npm start` to serve the UI in dev mode
- `npm run build` to build the UI static files in the `build` folder.

Then you can host it on github pages, amazon s3, netlify, your own nginx server...


## Launch the server with docker-compose

- clone the repo `git clone git@github.com:PLhery/unfollowNinja.git`
- `cd unfollowNinja/unfollow-ninja-server`
- create a .env file (see [.env file](#.env-file))
- `docker-compose up  --build`

The server will be accessible on http://localhost:4000/  

By default, the db files and logs are stored in /data subfolders. Feel free to edit these, and the port/address in `docker-compose.yml`

## Launch the server manually

- clone the repo `git clone git@github.com:PLhery/unfollowNinja.git`
- `cd unfollowNinja/unfollow-ninja-server`
- install the dependencies and build the project `npm ci && npm build`
- create a .env file (see [.env file](#.env-file))
- install redis and optionally set a custom REDIS_URI + REDIS_KUE_URI in .env
- launch the workers `node ./dist/api/workers`
- launch the api server `node ./dist/api`
- or launch both in the as a daemon with pm2 `pm2 start pm2.yml`

If you made some changes to the code, you can launch a new instance before exiting the former one to prevent downtime.

## .env file

To get started, you'll need to create one or two twitter app https://developer.twitter.com/en/apps:  
- One for the first step, which only need a read access, and a callback url = https://your-ui-url/1
- One for the second step, which needs a DM sending access, and a callback url = https://your-ui-url/2
- Both need to have sign in with twitter enabled

Then you can create a .env in unfollow-ninja-server to set some parameters:

```
CONSUMER_KEY=xxx # your first step app API key
CONSUMER_SECRET=xxx # your first step app API secret key
DM_CONSUMER_KEY=xxx # your second step app API key
DM_CONSUMER_SECRET=xxx # your second step app API secret key

WEB_URL=https://unfollow.ninja # Front-end URL (without any ending /)

# optionally:
CLUSTER_SIZE=2 # Number of workers, defaults to number of CPUs
WORKER_RATE_LIMIT=15 # Number of unique tasks managed at the same time, defaults to 15
MINUTES_BETWEEN_CHECKS=2 # Number of minutes between every followers check

SENTRY_DSN= # Sentry DSN, if you want to report workers errors on sentry
SENTRY_DSN_API= # Sentry DSN, if you want to report api errors on sentry
```

You can also set these parameters as environment variables.

## Contribute

Open an issue with your suggestions or assign yourself to an existing issue

### Translate the app to your language

- Fork the project
- copy unfollow-ninja-server/en.json to youLanguageCode.json
- fill translations
- change line 3 of unfollow-ninja-server/src/utils/types.ts and add your language code
- commit and submit a pull request

## Motivation behind improving the legacy version

Legacy version: https://github.com/PLhery/unfollowNinja/tree/legacy

The legacy version couldn't scale and manage thousands of users, while still checking every 2 minutes the followers.
Now, the program checks 50 000 users's followers every 3 minutes.

- Based on a job queue for:
    - Monitoring: I can see how many jobs/sec are happening, their errors, and rate limit them.
    - Scalability: Everything was happening in one thread. Now the work is shared between 8 workers/vCPUs.
    - Atomicity: When the server restart, wait for every atomic job to finish instead of interrupting them. (causing messages not sent or sent twice)
    - Reliability: If a job fails, prepare better retry strategies.
- Use Typescript to make code more bug-proof and clearer for contributors
- Split the webserver from the worker: When the worker was busy, the webserver was slow because everything was happening in the same thread.
- Use redis to store the list of followers as we need to read/write them really often/quickly
- I18n
- Use twitter's SnowFlake IDs to get the exact follow time
- New UI

# Licensing

[License](./license.md) (Apache V2)

UnfollowNinja uses multiple open-source projects:

#### Twemoji

Copyright 2020 Twitter, Inc and other contributors  
Code licensed under the MIT License: http://opensource.org/licenses/MIT  
Graphics licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/