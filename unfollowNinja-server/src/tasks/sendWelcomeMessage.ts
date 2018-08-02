import { Job } from 'kue';
import Task from './task';

export default class extends Task {
    public async run(job: Job) {
        return;
    }
}
