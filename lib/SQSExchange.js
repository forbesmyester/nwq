function merge() {
    var args = Array.prototype.slice.call(arguments),
        r = {};

    args.forEach(function(item) {
        for (var k in item) {
            r[k] = item[k];
        }
    });

    return r;

}

function sanitizeQueueName(rawQueueName) {
    return rawQueueName.replace(/[^a-z0-9\-_]/ig, '_');
}

export default class SQSExchange {

    constructor(sqs, newQueueAttributes) {
        this._sqs = sqs;
        this._newQueueAttributes = newQueueAttributes ? newQueueAttributes : {};
        if (this._newQueueAttributes.hasOwnProperty('_messagePollTime')) {
            delete this._newQueueAttributes._messagePollTime;
        }
        this._queueUrls = {};
    }

    _createQueue(queue, next) {
        this._sqs.createQueue(merge({
            QueueName: sanitizeQueueName(queue),
            Attributes: merge({}, this._newQueueAttributes)
        }), (err, doc) => {
            if (err) {
                return next(err);
            }
            this._queueUrls[queue] = doc.QueueUrl;
            next(err);
        });
    }

    _ensureQueue(queue, next) {
        this._sqs.getQueueUrl({
            QueueName: sanitizeQueueName(queue) },
            (err, doc) => {
                if (err) {
                    if (err.code === 'AWS.SimpleQueueService.NonExistentQueue') {
                        return this._createQueue(queue, next);
                    }
                    return next(err);
                }
                this._queueUrls[queue] = doc.QueueUrl;
                return next(err);
            }
        );
    }

    _retrieveMessage(queue, next) {
        var params = {
            QueueUrl: this._queueUrls[queue],
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20
        };
        var working = false;
        var interval = setInterval(() => {
            if (working) {
                return;
            }
            working = true;
            this._sqs.receiveMessage(params, (err2, data) => {
                if (err2) {
                    clearInterval(interval);
                    return next(err2);
                }
                if (!data.hasOwnProperty('Messages') || !data.Messages.length) {
                    working = false;
                    return false;
                }
                clearInterval(interval);
                next(null, data.Messages.shift());
            });
        }, 100);
    }

    removeMessage(queue, messageId) {
        var params = {
            QueueUrl: this._queueUrls[queue],
            ReceiptHandle: messageId
        };
        return new Promise((resolve, reject) => {
            this._sqs.deleteMessage(params, function(err) {
                if (err) {
                    return reject(err);
                }
                return resolve();
            });
        });
    }

    getMessage(queue) {
        return new Promise((resolve, reject) => {
            this._ensureQueue(queue, (err) => {
                if (err) { return reject(err); }
                this._retrieveMessage(queue, (err2, awsMsg) => {
                    if (err2) { return reject(err2); }
                    var msg = JSON.parse(awsMsg.Body);
                    if (!msg.hasOwnProperty('payload')) {
                        msg.payload = undefined;
                    }
                    msg.transportId = awsMsg.ReceiptHandle;
                    resolve(msg);
                });
            });
        });
    }

    postMessage(queue, msg) {
        return new Promise((resolve, reject) => {
            this._ensureQueue(queue, (err) => {
                if (err) {
                    return reject(err);
                }
                var params = {
                    QueueUrl: this._queueUrls[queue],
                    MessageBody: JSON.stringify(msg)
                };
                this._sqs.sendMessage(params, (err2) => {
                    if (err2) { return reject(err2); }
                    resolve();
                });
            });
        });
    }

    postMessagePayload(queue, payload) {
        return this.postMessage(queue, { path: [], payload: payload });
    }

}
