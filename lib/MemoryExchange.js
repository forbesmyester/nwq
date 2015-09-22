import getTLIdEncoderDecoder from 'get_tlid_encoder_decoder';

var encoderDecoder = getTLIdEncoderDecoder(
    new Date(1970, 0, 1).getTime(),
    4
);

var ks = function(ob) {
    return Object.getOwnPropertyNames(ob);
};

export default class MemoryExchange {

    constructor(options) {
        this._qs = {};
        var v = 30000; // 30 seconds default visibility time (same as SQS)
        if (options && options.hasOwnProperty('visibility')) {
            v = options.visibility;
        }
        this._visibility = v;
    }

    ensureQueue(queue, next) {
        if (!this._qs.hasOwnProperty(queue)) {
            this._qs[queue] = {};
        }
        setTimeout(() => { next(null); }, 1);
    }

    getMessage(queue, next) {
        this.ensureQueue(queue, (err) => {
            if (err) { return next(err); }
            var interval = setInterval(() => {
                var keys = ks(this._qs[queue]);
                keys.map((k) => {
                    var msg = this._qs[queue][k];
                    if (
                        msg[0] == -1 || // never retrieved
                        msg[0] + this._visibility < (new Date().getTime()) // retrieved and timed out
                    ) {
                        clearInterval(interval);
                        msg[0] = new Date().getTime();
                        next(null, msg[1]);
                    }
                });
            }, 50);
        });
    }

    removeMessage(queue, messageId, next) {
        delete this._qs[queue][messageId];
        next(null);
    }

    postMessage(queue, msg, next) {
        msg.transportId = encoderDecoder.encode();
        this.ensureQueue(queue, () => {
            this._qs[queue][msg.transportId] = [-1, msg];
            if (next) {
                next(null);
            }
        });
    }

    postMessagePayload(queue, payload, next) {
        this.postMessage(queue, { path: [], payload: payload }, next);
    }

    _dump() {
        return this._qs;
    }
}
