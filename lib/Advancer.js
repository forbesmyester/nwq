"use strict";

import {EventEmitter} from 'events';
import getTLIdEncoderDecoder from 'get_tlid_encoder_decoder';
import r_omit from 'ramda/src/omit';
import r_mapObj from 'ramda/src/mapObj';
import r_map from 'ramda/src/map';
import r_concat from 'ramda/src/concat';
import r_last from 'ramda/src/last';


var encoderDecoder = getTLIdEncoderDecoder(
    new Date(2015, 8, 1).getTime(),
    4
);

export default class Advancer extends EventEmitter {

    constructor(exchange) {
        super();
        this._exchange = exchange;
        this._routes = {};
    }

    addSpecification(sourceQueue, destinationQueueRouting, worker) {

        function fixToQueue(dstQueues) {
            if (dstQueues === null) {
                return [];
            }

            if (dstQueues === null) {
                return [];
            }

            if (typeof dstQueues == 'string') {
                return [dstQueues];
            }

            return dstQueues;
        }

        this._routes[sourceQueue] = {
            worker: worker,
            destinations: r_mapObj(fixToQueue, destinationQueueRouting)
        };
    }

    _lookup(srcQueue, resolution) {
        if (
            this._routes.hasOwnProperty(srcQueue) &&
            this._routes[srcQueue].destinations.hasOwnProperty(resolution)
        ) {
            return this._routes[srcQueue].destinations[resolution];
        }
        return [srcQueue + '/' + resolution];
    }

    _getResolution(newMessage) {
        return r_last(newMessage.path).replace(/.*\:/, '');
    }

    _postResults(srcQueue, processId) {
        return function({srcMessage, newMessage}) {

            var postResult = (toQueue) => {
                this.emit('postingResult', processId, toQueue, newMessage);
                return this._exchange.postMessage(toQueue, newMessage).then(() => {
                    this.emit('postedResult', processId, toQueue, newMessage);
                });
            };

            var dstQueues = this._lookup(srcQueue, this._getResolution(newMessage));
            return Promise.all(r_map(postResult, dstQueues))
                .then(() => { return {srcMessage, newMessage}; });
        };
    }

    _removeSource(srcQueue, processId) {
        return function({srcMessage, newMessage}) {
            this.emit('removingInput', processId, srcQueue, srcMessage);
            return this._exchange.removeMessage(srcQueue, srcMessage.transportId)
                .then(() => {
                    this.emit('removedInput', processId, srcQueue, srcMessage);
                })
                .then(() => { return {srcMessage, newMessage}; });
        };
    }

    _callWorker(srcQueue, payload) {

        return new Promise((resolve, reject) => {

            var done = false;
            var afterwards = (err, ...args) => {
                if (done) { return null; }
                done = true;
                let [resolution, newPayload={}] = args;
                if (args.length === 1) {
                    if (resolution.hasOwnProperty('resolution')) {
                        newPayload = resolution.payload;
                        resolution = resolution.resolution;
                    }
                    else if (resolution.hasOwnProperty('_resolution')) {
                        newPayload = r_omit(['_resolution'], resolution);
                        resolution = resolution._resolution;
                    }
                    else {
                        newPayload = resolution;
                        resolution = 'success';
                    }
                }
                if (err) {
                    return reject(err);
                }
                resolve({resolution: resolution, payload: newPayload});
            };

            var prom = this._routes[srcQueue].worker(payload, afterwards);

            if (prom && prom.then) {
                prom.then((result) => {
                    afterwards(null, result);
                })
                .catch(afterwards);
            }

            if (
                (prom && prom.hasOwnProperty('resolution')) ||
                (prom && prom.hasOwnProperty('_resolution'))
            ) {
                afterwards(null, prom);
            }

        });
    }

    runForever(srcQueue) {
        var running = false;
        setInterval(() => {
            if (running) { return; }
            running = true;
            this.run(srcQueue)
                .then((advResult) => {
                    running = false;
                    this.emit('processed', advResult);
                });
        }, 100);
    }

    run(srcQueue) {
        var processId = encoderDecoder.encode();
        this.emit('loadingMessage', processId, srcQueue);
        return this._exchange.getMessage(srcQueue)
            .then((srcMessage) => {
                if (!srcMessage.hasOwnProperty('path')) {
                    srcMessage.path = [];
                }
                if (!srcMessage.hasOwnProperty('payload')) {
                    srcMessage.payload = {};
                }
                if (!srcMessage.hasOwnProperty('initId')) {
                    srcMessage.initId = srcMessage.transportId;
                    if (typeof srcMessage.initId != 'string') {
                        srcMessage.initId = JSON.stringify(srcMessage.initId);
                    }
                }
                return srcMessage;
            })
            .then((srcMessage) => {
                this.emit('loadedMessage', processId, srcQueue, srcMessage);
                return this._callWorker(srcQueue, srcMessage.payload)
                    .then((newMessage) => {
                        newMessage.path = r_concat(
                            srcMessage.path,
                            [srcQueue + ":" + newMessage.resolution]
                        );
                        delete newMessage.resolution;
                        newMessage.initId = srcMessage.initId;
                        return {srcMessage, newMessage};
                    })
                    .catch((err) => {
                        var newMessage = {
                            path: r_concat(srcMessage.path, [srcQueue + ":err"]),
                            err: err,
                            initId: srcMessage.initId,
                            oldPayload: srcMessage.payload
                        };
                        return {srcMessage, newMessage};
                    });
            })
            .then(this._postResults(srcQueue, processId).bind(this))
            .then(this._removeSource(srcQueue, processId).bind(this))
            .then(({srcMessage, newMessage}) => {
                var dstQueues = this._lookup(srcQueue, this._getResolution(newMessage));
                return {
                    srcQueue: srcQueue,
                    dstQueues: dstQueues,
                    srcMessage: srcMessage,
                    newMessage: newMessage
                };
            });
    }


}

