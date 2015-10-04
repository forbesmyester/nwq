import getTLIdEncoderDecoder from 'get_tlid_encoder_decoder';
import {EventEmitter} from 'events';

var encoderDecoder = getTLIdEncoderDecoder(
    new Date(2015, 8, 1).getTime(),
    4
);

function getOption(key, defaults, options) {
    if (options.hasOwnProperty(key)) {
        return options[key];
    }
    return defaults[key];
}

export default class MemoryExchange extends EventEmitter {

    constructor(options) {
        super();
        if (options === undefined) {
            options = {};
        }
        this._qs = {};
        var defaults = {
            visibility: 30, // 30 seconds default visibility time (same as SQS, in seconds)
            retention: 345600, // 4 days (same as SQS, in seconds)
            _messagePollTime: 50 // how often to poll for messages, in miniseconds!
        };
        this._visibility = getOption('VisibilityTimeout', defaults, options) * 1000;
        this._retention = getOption('MessageRetentionPeriod', defaults, options) * 1000;
        this._messagePollTime = getOption('_messagePollTime', defaults, options);

        if (!options.hasOwnProperty('runMessageCleanup') || options.runMessageCleanup) {
            setInterval(() => {
                for (var queue in this._qs) {
                    this._cleanUpDeadMessages(queue);
                }
            }, this._messagePollTime);
        }

    }

    _cleanUpDeadMessages(queue) {
        Object.getOwnPropertyNames(this._qs[queue]).forEach((k) => {
            if (this._qs[queue][k][1] + this._retention < (new Date().getTime())) {
                this.removeMessage(queue, k);
                return false;
            }
        });
    }

    _ensureQueue(queue) {
        if (!this._qs.hasOwnProperty(queue)) {
            this.emit('createQueue', queue);
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
        this._cleanUpDeadMessages(queue);
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
        return this._qs[queue][transportId][2];
    }

    _markMessageAsCollected(queue, transportId) {
        this._qs[queue][transportId][0] = new Date().getTime();
    }

    getMessage(queue) {
        return new Promise((resolve) => {
            var interval = setInterval(() => {
                var transportIds = this._transportIdsReadyForCollection(queue);
                if (!transportIds.length) { return; }
                clearInterval(interval);
                this._markMessageAsCollected(queue, transportIds[0]);
                this.emit('getMessage',
                    queue,
                    transportIds[0],
                    this._qs[queue][transportIds[0]]
                );
                resolve(this._retrieveMessagePayload(queue, transportIds[0]));
            }, this._messagePollTime);
        });
    }

    removeMessage(queue, transportId) {
        return new Promise((resolve) => {
            this.emit(
                'removeMessage',
                queue,
                transportId,
                this._qs[queue][transportId]
            );
            delete this._qs[queue][transportId];
            resolve();
        });
    }

    postMessage(queue, msg) {
        return new Promise((resolve) => {
            msg.transportId = encoderDecoder.encode();
            this._ensureQueue(queue);
            this.emit('postMessage', queue, msg.transportId, msg);
            this._qs[queue][msg.transportId] = [-1, new Date().getTime(), msg];
            resolve();
        });
    }

    postMessagePayload(queue, payload) {
        return this.postMessage(queue, { path: [], payload: payload });
    }

}
