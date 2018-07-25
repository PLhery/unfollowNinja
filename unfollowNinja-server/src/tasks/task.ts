import {Redis} from 'ioredis';
import {DoneCallback, Job, Queue} from 'kue';

export default abstract class Task {
    protected redis: Redis;
    protected queue: Queue;

    constructor(redis: Redis, queue: Queue) {
        this.redis = redis;
        this.queue = queue;
    }

    public abstract run(job: Job,  done: DoneCallback): void;
}
