import getTLIdEncoderDecoder from 'get_tlid_encoder_decoder';

var encoderDecoder = getTLIdEncoderDecoder(
    new Date(1970, 0, 1).getTime(),
    4
);

var ks = function(ob) {
    return Object.getOwnPropertyNames(ob);
};

export default class MemoryExchange {

    constructor() {
        this.qs = {};
    }

    ensureQueue(queue, next) {
        if (!this.qs.hasOwnProperty(queue)) {
            this.qs[queue] = {};
        }
        setTimeout(() => { next(null); }, 1);
    }

    getMessage(queue, next) {
        this.ensureQueue(queue, (err) => {
            if (err) { return next(err); }
            var interval = setInterval(() => {
                var keys = ks(this.qs[queue]);
                if (keys.length) {
                    var k = keys.shift(),
                        r = this.qs[queue][k];
                    clearInterval(interval);
                    // Messages should be suspended and woken up later like AWS... tricky... better just delete them here for now... Best to test with AWS to verify...
                    this.removeMessage(queue, k, () => {
                        next(null, r);
                    });
                }
            }, 10);
        });
    }

    removeMessage(queue, messageId, next) {
        delete this.qs[queue][messageId];
        next(null);
    }

    postMessage(queue, msg, next) {
        msg.id = encoderDecoder.encode();
        this.ensureQueue(queue, () => {
            this.qs[queue][msg.id] = msg;
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
