import { StatsD } from 'hot-shots';

const STATSD_HOST = process.env.STATSD_HOST || undefined;
const DD_AGENT_HOST = process.env.DD_AGENT_HOST || undefined;
const METRICS_PREFIX = process.env.METRICS_PREFIX || 'uninja';

export default class Metrics {
    private static statsDClients: StatsD[] = [];

    public static addStatsdHost(host: string, port: number = 8125) {
        this.statsDClients.push(new StatsD({host, port}))
    }

    public static gauge(metric: string, value: number) {
        this.statsDClients
            .forEach(client => client.gauge(METRICS_PREFIX + '.' + metric, value));
    }

    public static increment(metric: string, value: number = 1) {
        this.statsDClients
            .forEach(client => client.increment(METRICS_PREFIX + '.' + metric, value));
    }

    public static kill() {
        this.statsDClients.forEach(client => client.close(null))
    }
}
if (STATSD_HOST) {
    Metrics.addStatsdHost(STATSD_HOST);
}
if (DD_AGENT_HOST) { // datadog
    Metrics.addStatsdHost(DD_AGENT_HOST, Number(process.env.DD_DOGSTATSD_PORT || 8125));
}