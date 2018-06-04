import * as winston from 'winston';
import * as Kue from 'kue';
import { isMaster, fork } from 'cluster';
import { cpus } from 'os';

const clusterWorkerSize = cpus().length;
const queue = Kue.createQueue();

const KUE_APP_PORT = 3000;

winston.info('Unfollow ninja - Server');

if (isMaster) {
    queue.on( 'error', function( err ) {
        winston.error( 'Oops... ', err );
    });

    winston.info('Launching the %s workers...', clusterWorkerSize);
    for (var i = 0; i < clusterWorkerSize; i++) {
        fork();
    }

    winston.info('Launching kue web server on port %d', KUE_APP_PORT);
    Kue.app.listen(KUE_APP_PORT, () => {
        winston.info('Launching the web server...');
    });


    setInterval(() => queue.create('sendWelcomeMessage', {username: 'plhery'}).save(), 1000);
} else {
    winston.info('Worker ready');

    queue.process('checkFollowers', 10, function(job, done){
        job.log('followers checked')
    });
    queue.process('updateFollowingID', 10, function(job, done){
        job.log('follower ID checked')
    });
    queue.process('notifyUser', 10, function(job, done){
        job.log('user notified')
    });
    queue.process('sendWelcomeMessage', 10, function(job, done){
        job.log('user welcomed');
        winston.info('user welcomed');
    });
}