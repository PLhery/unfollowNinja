# Unfollow Ninja [![Server CI status](https://github.com/PLhery/unfollowNinja/workflows/Server%20CI/badge.svg)](https://github.com/PLhery/unfollowNinja/actions?query=workflow%3A%22Server+CI%22)

https://unfollow.ninja
: Receive a notification when someone unfollows you on Twitter

![Screenshot](https://raw.githubusercontent.com/PLhery/unfollowNinja/master/unfollow-ninja-ui/public/preview.png)

## Install

- clone the repo `git clone git@github.com:PLhery/unfollowNinja.git`
- `cd unfollowNinja/unfollowNinja-server`
- install the dependencies and build the project `npm install && npm build`
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
CLUSTER_SIZE=2 # Number of workers, defaults to number of CPUs
WORKER_RATE_LIMIT=15 # Number of unique tasks managed at the same time, defaults to 15

BETA_USERS=unfollowninja # List of usernames that have access to beta features
MINUTES_BETWEEN_CHECKS=2 # Number of minutes between every followers check

WEB_URL=http://unfollow.ninja # Front-end external URL

SENTRY_DSN= # Sentry DSN, if sentry is enabled
```

You can also set these parameters as environment variables.

Moreover, you can change the api url in `unfollow-ninja-ui/src/App.js`

## Contribute

Open an issue with your suggestions or assign yourself to an existing issue

### Translate the app to your language

- Fork the project
- copy unfollowNinja-server/en.json to youLanguageCode.json
- fill translations
- change line 3 of unfollowNinja-server/src/utils/types.ts and add your language code
- commit and submit a pull request


## Motivation behind improving the legacy version

Legacy version: https://github.com/PLhery/unfollowNinja/tree/legacy

The legacy version couldn't scale and manage thousands of users, while still checking every 2 minutes the followers.
Now, the program checks 50 000 users's followers every 3 minutes.

- Based on a job queue for:
    - Monitoring: I can see how much job/sec is happening, their errors, and rate limit them.
    - Scalability: Everything was happening in one thread. Now the work is shared between 8 workers/vCPUs.
    - Atomicity: When the server restart, wait for every atomic job to finish instead of interrupting them. (causing messages not sent or sent twice)
    - Reliability: If a job fails, prepare better retry strategies.
- Use Typescript to make code more bug-proof and clearer for contributors
- Split the webserver from the worker: When the worker was busy, the webserver was slow because everything was happening in the same thread.
- Use redis for improved db performance
- I18n
- Use twitter's SnowFlake IDs to get the exact follow time
- New UI

[License](./license.md) (Apache V2)