"use strict";

// Would usually just use from Node, except as this is the only dependency
// it makes sense to use this for code bloat size reasons...
function assertEqual(a, b) {
    if (a !== b) {
        throw new Error(
            "Expected " + JSON.stringify(a) + " to equal " + JSON.stringify(b)
        );
    }
}

function lookup(queueName, queueOutput, resolution) {
    assertEqual(typeof queueName, "string");
    assertEqual(typeof queueOutput, "object");
    assertEqual(typeof resolution, "string");

    if (queueOutput.hasOwnProperty(resolution)) {
        return queueOutput[resolution];
    }
    return queueName + '/' + resolution;
}

function finish(exchange, fromQueue, toQueue, messageId, message, next) {

    var remove = function() {
        exchange.removeMessage(fromQueue, messageId, function(err) {
            if (err) { return next(err); }
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
        });
    };

    var getP = function(toQ) {
        return new Promise(function(resolve, reject) {
            exchange.postMessage(toQ, message, function(err) {
                if (err) { return reject(err); }
                resolve(err);
            });
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
        });

}

function advancer(queueName, queueOutput, exchange, worker, next) {
    exchange.getMessage(queueName, function(err, message) {
        if (err) { return next(err); }
        if (!message.hasOwnProperty('path')) {
            message.path = [];
        }
        if (!message.hasOwnProperty('body')) {
            message.body = {};
        }
        var messageId = message.id;
        delete message.id;
        worker(message.body, function(err2, resolution, newBody) {
            if (arguments.length < 3) {
                newBody = resolution;
                resolution = "success";
            }
            if (!newBody) {
                message.previousBody = message.body;
            }
            if (err2) {
                message.err = err2;
                resolution = 'err';
            }
            message.path.push(queueName + ":" + resolution);
            message.body = newBody;
            let toQueue = lookup(queueName, queueOutput, resolution);
            finish(exchange, queueName, toQueue, messageId, message, next);
        });
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
