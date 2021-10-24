import type {Job, Queue} from 'bull';
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

export type TaskClass = new(dao: Dao, queue: Queue) => Task