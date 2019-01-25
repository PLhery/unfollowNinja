import {Job, Queue} from 'kue';
import Dao from '../dao/dao';

export default abstract class Task {
    protected dao: Dao;
    protected queue: Queue;

    constructor(dao: Dao, queue: Queue) {
        this.dao = dao;
        this.queue = queue;
    }

    public abstract run(job: Job): Promise<Error|void>;
}
