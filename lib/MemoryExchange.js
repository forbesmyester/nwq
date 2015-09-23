import getTLIdEncoderDecoder from 'get_tlid_encoder_decoder';

var encoderDecoder = getTLIdEncoderDecoder(
    new Date(2015, 8, 1).getTime(),
    4
);

export default class MemoryExchange {

    constructor(options) {
        this._qs = {};
        var v = 30000; // 30 seconds default visibility time (same as SQS)
        if (options && options.hasOwnProperty('visibility')) {
            v = options.visibility;
        }
        this._visibility = v;
    }

    _ensureQueue(queue) {
        if (!this._qs.hasOwnProperty(queue)) {
            this._qs[queue] = {};
        }
    }

    /**
     * Scans a collection to see if any keys need retrieval.
     *
     * TODO: Returns all transportIds, which is wasteful as we probably
     * only ever need the first
     */
    _transportIdsReadyForCollection(queue) {
        this._ensureQueue(queue);
        return Object.getOwnPropertyNames(this._qs[queue]).filter((k) => {
            if (
                // if never retrieved
                this._qs[queue][k][0] == -1 ||
                // retrieved but visiblity has brought it back
                this._qs[queue][k][0] + this._visibility < (new Date().getTime())
            ) {
                return true;
            }
        });
    }

    _retrieveMessagePayload(queue, transportId) {
        return this._qs[queue][transportId][1];
    }

    _markMessageAsCollected(queue, transportId) {
        this._qs[queue][transportId][0] = new Date().getTime();
    }

    getMessage(queue, next) {
        return new Promise((resolve) => {
            var interval = setInterval(() => {
                var transportIds = this._transportIdsReadyForCollection(queue);
                if (!transportIds.length) { return; }
                clearInterval(interval);
                this._markMessageAsCollected(queue, transportIds[0]);
                if (next) {
                    next(null, this._retrieveMessagePayload(queue, transportIds[0]));
                }
                resolve(this._retrieveMessagePayload(queue, transportIds[0]));
            }, 50);
        });
    }

    removeMessage(queue, messageId, next) {
        delete this._qs[queue][messageId];
        next(null);
    }

    postMessage(queue, msg, next) {
        msg.transportId = encoderDecoder.encode();
        this._ensureQueue(queue);
        this._qs[queue][msg.transportId] = [-1, msg];
        if (next) {
            next(null);
        }
    }

    postMessagePayload(queue, payload, next) {
        return this.postMessage(queue, { path: [], payload: payload }, next);
    }

    _dump() {
        return this._qs;
    }
}
