import { expect } from 'chai';
import { Job } from 'kue';
import { fake } from 'sinon';
import * as winston from 'winston';
import CheckFollowers from '../../src/tasks/checkFollowers';

winston.transports.Console.level = 'error';

describe('checkFollower task', () => {
    it('done should be called', () => {
        const job = new Job('checkFollowers', {username: 'testUsername'});
        const done = fake();
        const task = new CheckFollowers(null, null);
        task.run(job, done);
        expect(done.calledOnce);
    });
});
