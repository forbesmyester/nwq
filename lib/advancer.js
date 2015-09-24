"use strict";

function lookup(queueName, queueOutput, resolution) {
    if (queueOutput.hasOwnProperty(resolution)) {
        return queueOutput[resolution];
    }
    return queueName + '/' + resolution;
}

function finish(exchange, fromQueue, toQueue, transportId, message, next) {

    var remove = function() {
        return exchange.removeMessage(fromQueue, transportId).then(() => {
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
        return exchange.postMessage(toQ, message);
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

function advancer(queueName, queueOutput, exchange, worker, next) {
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
        var transportId = message.transportId;
        delete message.transportId;
        worker(message.payload, function(err2, resolution, newPayload) {
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
            finish(exchange, queueName, toQueue, transportId, message, next);
        });
    }).catch((err) => {
        next(err);
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

advancer.forever = function(times, queueName, queueOutput, exchange, worker, resultNotify, terminatedNotify) {
    var adv = advancer.bind(this, queueName, queueOutput, exchange, worker);
    advancer._forever(adv, times, resultNotify, terminatedNotify);
};

export default advancer;
