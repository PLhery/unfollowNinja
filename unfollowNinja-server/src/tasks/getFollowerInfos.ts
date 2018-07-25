import {DoneCallback, Job} from 'kue';
import Task from './task';

export default class extends Task {
    public run(job: Job,  done: DoneCallback) {
        done();
    }
}
