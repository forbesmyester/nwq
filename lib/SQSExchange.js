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

export default class MemoryExchange {

    constructor(sqs, newQueueAttributes) {
        this.sqs = sqs;
        this.newQueueAttributes = newQueueAttributes;
        this.queueUrls = {};
    }

    _createQueue(queue, next) {
        this.sqs.createQueue(merge({
            QueueName: sanitizeQueueName(queue),
            Attributes: merge({}, this.newQueueAttributes)
        }), (err, doc) => {
            if (err) {
                return next(err);
            }
            this.queueUrls[queue] = doc.QueueUrl;
            next(err);
        });
    }

    ensureQueue(queue, next) {
        this.sqs.getQueueUrl({
            QueueName: sanitizeQueueName(queue) },
            (err, doc) => {
                if (err) {
                    if (err.code === 'AWS.SimpleQueueService.NonExistentQueue') {
                        return this._createQueue(queue, next);
                    }
                    return next(err);
                }
                this.queueUrls[queue] = doc.QueueUrl;
                return next(err);
            }
        );
    }

    _retrieveMessage(queue, next) {
        var params = {
            QueueUrl: this.queueUrls[queue],
            MaxNumberOfMessages: 1,
            WaitTimeSeconds: 20
        };
        var working = false;
        var interval = setInterval(() => {
            if (working) {
                return;
            }
            working = true;
            this.sqs.receiveMessage(params, (err2, data) => {
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

    _removeMessage(queue, messageBody, next) {
        var params = {
            QueueUrl: this.queueUrls[queue],
            ReceiptHandle: messageBody.ReceiptHandle
        };
        this.sqs.deleteMessage(params, next);
    }

    getMessage(queue, next) {
        this.ensureQueue(queue, (err) => {
            if (err) { return next(err); }
            this._retrieveMessage(queue, (err2, awsMsg) => {
                if (err) { return next(err2); }
                var msg = JSON.parse(awsMsg.Body);
                if (!msg.hasOwnProperty('body')) {
                    msg.body = undefined;
                }
                this._removeMessage(queue, awsMsg, (err3) => {
                    next(err3, msg);
                });
            });
        });
    }

    postMessage(queue, msg, next) {
        this.ensureQueue(queue, (err) => {
            if (err) { return next(err); }
            var params = {
                QueueUrl: this.queueUrls[queue],
                MessageBody: JSON.stringify(msg)
            };
            this.sqs.sendMessage(params, (err2) => {
                if (next) { next(err2); }
            });
        });
    }

    postMessageBody(queue, msgBody, next) {
        this.postMessage(queue, { path: [], body: msgBody }, next);
    }

}
