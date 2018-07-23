import checkFollowers  from '../../src/tasks/checkFollowers';
import { expect } from 'chai';
import { fake } from 'sinon';
import { Job } from "kue";
import * as winston from 'winston';

winston.transports.Console.level = 'error';

describe('checkFollower task', () => {
    it('done should be called', () => {
        const job = new Job("checkFollowers", {username: 'testUsername'});
        const done = fake();
        checkFollowers(job, done);
        expect(done.calledOnce);
    });
});