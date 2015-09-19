export default class MemoryExchange {

    constructor() {
        this.qs = {};
    }

    ensureQueue(queue, next) {
        if (!this.qs.hasOwnProperty(queue)) {
            this.qs[queue] = [];
        }
        setTimeout(() => { next(null); }, 1);
    }

    getMessage(queue, next) {
        this.ensureQueue(queue, (err) => {
            if (err) { return next(err); }
            var interval = setInterval(() => {
                if (this.qs[queue].length) {
                    clearInterval(interval);
                    next(null, this.qs[queue].shift());
                }
            }, 10);
        });
    }

    postMessage(queue, msg, next) {
        this.ensureQueue(queue, () => {
            this.qs[queue].push(msg);
            if (next) {
                next(null);
            }
        });
    }

    postMessageBody(queue, msgBody, next) {
        this.postMessage(queue, { path: [], body: msgBody }, next);
    }

    _dump() {
        return this.qs;
    }
}
