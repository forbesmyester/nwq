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
            next(null, { fromQueue: fromQueue, toQueue: toQueue });
        });
    };

    if (toQueue === null) {
        return remove();
    }

    exchange.postMessage(toQueue, message, function(err) {
        if (err) { return next(err); }
        remove();
    });

}

export default function advancer(queueName, queueOutput, exchange, worker, next) {
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
