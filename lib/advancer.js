"use strict";

import {EventEmitter} from 'events';
import getTLIdEncoderDecoder from 'get_tlid_encoder_decoder';

function lookup(queueName, queueOutput, resolution) {
    if (queueOutput.hasOwnProperty(resolution)) {
        return queueOutput[resolution];
    }
    return queueName + '/' + resolution;
}

var encoderDecoder = getTLIdEncoderDecoder(
    new Date(2015, 8, 1).getTime(),
    4
);


function finish(ee, processId, exchange, fromQueue, toQueue, transportId, message, next) {

    var remove = function() {
        ee.emit('removingInput', processId, message.initId, fromQueue, message);
        return exchange.removeMessage(fromQueue, transportId).then(() => {
            ee.emit('removedInput', processId, message.initId, fromQueue, message);
            if (toQueue === null) {
                return next(
                    null,
                    { message: message, fromQueue: fromQueue, toQueue: null }
                );
            }
            toQueue.map(function(toQ) {
                next(
                    null,
                    { message: message, fromQueue: fromQueue, toQueue: toQ }
                );
            });
        }).catch((err) => {
            next(err);
        });
    };

    var getP = function(toQ) {
        ee.emit('postingResult', processId, message.initId, toQueue, message);
        return exchange.postMessage(toQ, message).then(function() {
            ee.emit('postedResult', processId, message.initId, toQueue, message);
        });
    };

    if (toQueue === null) {
        return remove();
    }

    if (typeof toQueue == 'string') {
        toQueue = [toQueue];
    }

    Promise.all(toQueue.map(getP))
        .then(function() {
            remove();
        }).catch((err) => {
            next(err);
        });

}

function addEvents(ee, options) {
    var s, k;
    for (k in options) {
        if (k.match(/^on/)) {
            s = k.substring(2, 3).toLowerCase() + k.substring(3);
            ee.on(s, options[k]);
        }
    }
}
/**
 * Options takes the form:
 *
 *     {
 *         onLoadingMessage: function(processId)
 *         onLoadedMessage: function(processId, initId, queue, message)
 *         onPostingResult: function(processId, initId, queue, message)
 *         onPostedResult: function(processId, initId, queue, message)
 *         onRemovingInput: function(processId, initId, queue, message)
 *         onRemovedInput: function(processId, initId, queue, message)
 *     }
 */
function advancer(queueName, queueOutput, exchange, worker, options, next) {
    var processId = encoderDecoder.encode(),
        ee = new EventEmitter(),
        needToCallNext = true;
    addEvents(ee, options);
    ee.emit('loadingMessage', processId);
    exchange.getMessage(queueName).then((message) => {
        if (!message.hasOwnProperty('path')) {
            message.path = [];
        }
        if (!message.hasOwnProperty('payload')) {
            message.payload = {};
        }
        if (!message.hasOwnProperty('initId')) {
            message.initId = message.transportId;
            if (typeof message.initId != 'string') {
                message.initId = JSON.stringify(message.initId);
            }
        }
        ee.emit('loadedMessage', processId, message.initId, queueName, message);
        var transportId = message.transportId;
        delete message.transportId;
        worker(message.payload, function(err2, resolution, newPayload) {
            needToCallNext = false;
            if (arguments.length < 3) {
                newPayload = resolution;
                resolution = "success";
            }
            if (!newPayload) {
                message.previousPayload = message.payload;
            }
            if (err2) {
                message.err = err2;
                resolution = 'err';
            }
            message.path.push(queueName + ":" + resolution);
            message.payload = newPayload;
            let toQueue = lookup(queueName, queueOutput, resolution);
            finish(ee, processId, exchange, queueName, toQueue, transportId, message, next);
        });
    }).catch((err) => {
        if (needToCallNext) {
            next(err);
        }
    });
}

// Basic forever function, there are other ones I could have used, but I didn't want to bloat the library.
advancer._forever = function(f, count, startedNotify, resultNotify, terminatedNotify) {

    var errHasOccured = false,
        runningCount = 0;

    function whenFFinishes(err, result) {
        if (err && !errHasOccured) {
            errHasOccured = true;
            terminatedNotify(err);
        }
        if (errHasOccured) {
            return; // throw away results after err
        }
        resultNotify(result);
        runningCount--;
    }

    setInterval(function() {
        if (runningCount < count) {
            runningCount++;
            startedNotify();
            f(whenFFinishes);
        }
    }, 10);
};

advancer.forever = function(times, queueName, queueOutput, exchange, worker, options, startNotify, resultNotify, terminatedNotify) {
    var adv = advancer.bind(this, queueName, queueOutput, exchange, worker, options);
    advancer._forever(adv, times, startNotify, resultNotify, terminatedNotify);
};

export default advancer;
