import SDC from 'statsd-client';

const STATSD_HOST = process.env.STATSD_HOST || undefined;

export default class Metrics {
    public static setStatsdHost(host: string) {
        this.sdc = new SDC({host: STATSD_HOST});
    }

    public static gauge(metric: string, value: number) {
        if (this.sdc) {
            this.sdc.gauge(metric, value);
        }
    }

    private static sdc: SDC;
}
if (STATSD_HOST) {
    Metrics.setStatsdHost(STATSD_HOST);
}
