"use strict";

import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";
import SQSExchange from "../lib/SQSExchange";
import Advancer from "../lib/Advancer";
import AWS from "aws-sdk";

describe('advancer with ' + (process.env.NWQ_TEST_SQS ? 'SQS' : 'Memory'), function() {

    this.timeout(10000);

    function validatePayload(payload, next) {
        if (!payload.hasOwnProperty('name')) { return next(null, "done", {tea: 'please'}); }
        if (payload.name.length < 5) {
            return next(null, {name: "Teapot"});
        }
        next(null, {name: payload.name});
    }

    function validateAlwaysError(payload, next) {
        next(new Error("Dies"));
    }

    function getExchange() {
        if (process.env.NWQ_TEST_SQS) {
            let sqs = new AWS.SQS({region: "eu-west-1"});
            return new SQSExchange(sqs);
        }
        return new MemoryExchange();
    }

    it('advance, on errors (known)', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'mangle-bob',
            { "err": ["bob-is-dead"] },
            validateAlwaysError
        );

        adv.run('mangle-bob')
            .then(function(advResult) {
                expect(advResult.srcQueue).to.equal('mangle-bob');
                expect(advResult.dstQueues).to.eql(['bob-is-dead']);
                expect(advResult.newMessage).to.haveOwnProperty('oldPayload');
                expect(advResult.newMessage).to.haveOwnProperty('initId');
                done();
            });

        exchange.postMessagePayload('mangle-bob', {name: "Bob"});

    });

    it('can do promises, multiple stages and check destination strings also work', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange),
            initId;

        adv.addSpecification(
            'validate-payload',
            { "success": "process" },
            function({score}) {
                return new Promise((resolve) => {
                    resolve({ score: score + 1 });
                });
            }
        );

        adv.addSpecification(
            'process',
            {},
            function({score}) {
                return new Promise((resolve) => {
                    resolve({ score: score + 10 });
                });
            }
        );

        adv.run('validate-payload')
            .then(function(advResult) {
                initId = advResult.newMessage.initId;
                expect(advResult.srcQueue).to.equal('validate-payload');
                expect(advResult.dstQueues).to.eql(["log-success"]);
                expect(advResult.newMessage).to.haveOwnProperty('payload');
                expect(advResult.newMessage.payload).to.eql({score: 2});
                expect(advResult.newMessage).to.haveOwnProperty('initId');
            });

        adv.run('process')
            .then(function(advResult) {
                expect(advResult.srcQueue).to.equal('process');
                expect(advResult.dstQueues).to.eql(["process/success"]);
                expect(advResult.newMessage.payload).to.eql({score: 12});
                expect(advResult.newMessage.initId).to.eql(initId);
                done();
            });

        exchange.postMessagePayload('validate-payload', {score: 1});

    });

    it('can do promises with errors', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'validate-payload',
            { "success": ["construct-url", "log-success"] },
            function() {
                return new Promise((resolve, reject) => {
                    reject(new Error("It Errors"));
                });
            }
        );

        adv.run('validate-payload')
            .then(function(advResult) {
                expect(advResult.srcQueue).to.equal('validate-payload');
                expect(advResult.dstQueues).to.eql(["validate-payload/err"]);
                expect(advResult.newMessage).to.haveOwnProperty('oldPayload');
                expect(advResult.newMessage).to.haveOwnProperty('initId');
                done();
            });

        exchange.postMessagePayload('validate-payload', {name: "Bob"});

    });

    it('advance, on errors (unknown)', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'validate-payload',
            { "success": ["construct-url", "log-success"] },
            validateAlwaysError
        );

        adv.run('validate-payload')
            .then(function(advResult) {
                expect(advResult.srcQueue).to.equal('validate-payload');
                expect(advResult.dstQueues).to.eql(['validate-payload/err']);
                expect(advResult.newMessage).to.haveOwnProperty('oldPayload');
                expect(advResult.newMessage).to.haveOwnProperty('initId');
                done();
            });

        exchange.postMessagePayload('validate-payload', {name: "Bob"});

    });

    it('advance, with working events', function(done) {

        var exchange = getExchange(),
            events = [];

        function recordEvent(eventName) {
            return function(processId, initId /* , fromQueue, toQueue, message */) {
                events.push([eventName, processId, initId]);
            };
        }

        var adv = new Advancer(exchange);
        adv.addSpecification(
            'validate-payload',
            { "success": ["construct-url", "log-success"] },
            validatePayload
        );

        adv.on('loadingMessage', recordEvent('loadingMessage'));
        adv.on('loadedMessage', recordEvent('loadedMessage'));
        adv.on('postingResult', recordEvent('postingResult'));
        adv.on('postedResult', recordEvent('postedResult'));
        adv.on('removingInput', recordEvent('removingInput'));
        adv.on('removedInput', recordEvent('removedInput'));

        adv.run('validate-payload')
            .then(function(advResult) {
                expect(advResult.srcQueue).to.equal('validate-payload');
                expect(advResult.dstQueues).to.eql(['construct-url', 'log-success']);
                expect(advResult).to.haveOwnProperty('newMessage');
                expect(advResult.newMessage).to.haveOwnProperty('initId');
                expect(events.map(function(itm) { return itm[0]; })).to.eql([
                    'loadingMessage',
                    'loadedMessage',
                    'postingResult',
                    'postingResult',
                    'postedResult',
                    'postedResult',
                    'removingInput',
                    'removedInput'
                ]);
                events.forEach(function(item) {
                    expect(item[1]).to.eql(events[1][1]);
                });
                done();
            });

        exchange.postMessagePayload('validate-payload', {name: "Bob"});

    });

    it('will advance to [SOURCE_QUEUE]/resolution', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'validate-payload',
            { "success": ["construct-url", "log-success"] },
            validatePayload
        );

        adv.run('validate-payload').then(function(advResult) {
            expect(advResult.srcQueue).to.eql('validate-payload');
            expect(advResult.dstQueues).to.eql(['validate-payload/done']);
            done();
        });

        exchange.postMessagePayload('validate-payload', {});
    });

    it('will advance to nowhere if it advances to `null`', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'validate-payload',
            { "success": ["construct-url", "log-success"], "done": null },
            validatePayload
        );

        adv.run('validate-payload').then(function(advResult) {
            expect(advResult.srcQueue).to.eql('validate-payload');
            expect(advResult.dstQueues).to.eql([]);
            done();
        });

        exchange.postMessagePayload('validate-payload', {});
    });

    it('will continue to advance if runForever() is used', function(done) {

        var i = 1;
        function somethingSlow(payload, next) {
            setTimeout(function() {
                next(null, { i: i++ });
            }, 50);
        }

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'validate-payload',
            {},
            somethingSlow
        );

        var times = 0;
        adv.on('processed', function(advResult) {
            expect(advResult.srcQueue).to.eql('validate-payload');
            expect(advResult.dstQueues).to.eql(['validate-payload/success']);
            expect(advResult.newMessage.payload).to.eql({i: times + 1});
            if (++times == 2) {
                done();
            }
        });

        adv.runForever('validate-payload');

        exchange.postMessagePayload('validate-payload', {});
        exchange.postMessagePayload('validate-payload', {});
        exchange.postMessagePayload('validate-payload', {});

    });

    describe('can process worker results', function() {
        var exchange = getExchange(),
            adv = new Advancer(exchange),
            desiredResult = {
                resolution: "success",
                payload: { greet: "Hello Andrew" }
            };

        it('is a promiseNone', function(done) {
            function promiseNone(payload) {
                return new Promise((resolve) => {
                    resolve({ greet: "Hello " + payload.name });
                });
            }
            adv.addSpecification('promiseNone', {"success": "success"}, promiseNone);
            adv._callWorker('promiseNone', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a promiseSimple', function(done) {
            function promiseSimple(payload) {
                return new Promise((resolve) => {
                    resolve({ _resolution: 'success', greet: "Hello " + payload.name });
                });
            }
            adv.addSpecification('promiseSimple', {"success": "success"}, promiseSimple);
            adv._callWorker('promiseSimple', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a promiseFull', function(done) {
            function promiseFull(payload) {
                return new Promise((resolve) => {
                    resolve({ resolution: 'success', payload: { greet: "Hello " + payload.name } });
                });
            }
            adv.addSpecification('promiseFull', {"success": "success"}, promiseFull);
            adv._callWorker('promiseFull', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a asReturnFull', function(done) {
            function asReturnFull(payload) {
                return { resolution: 'success', payload: { greet: "Hello " + payload.name } };
            }
            adv.addSpecification('asReturnFull', {"success": "success"}, asReturnFull);
            adv._callWorker('asReturnFull', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a asReturnSimple', function(done) {
            function asReturnSimple(payload) {
                return { _resolution: 'success', greet: "Hello " + payload.name };
            }
            adv.addSpecification('asReturnSimple', {"success": "success"}, asReturnSimple);
            adv._callWorker('asReturnSimple', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a callbackNone', function(done) {
            function callbackNone(payload, next) {
                next(null, { greet: "Hello " + payload.name });
            }
            adv.addSpecification('callbackNone', {"success": "success"}, callbackNone);
            adv._callWorker('callbackNone', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a callbackLikePromiseSimple', function(done) {
            function callbackLikePromiseSimple(payload, next) {
                next(null, { _resolution: "success", greet: "Hello " + payload.name });
            }
            adv.addSpecification('callbackLikePromiseSimple', {"success": "success"}, callbackLikePromiseSimple);
            adv._callWorker('callbackLikePromiseSimple', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a callbackLikePromiseFull', function(done) {
            function callbackLikePromiseFull(payload, next) {
                next(null, { resolution: "success", payload: { greet: "Hello " + payload.name } });
            }
            adv.addSpecification('callbackLikePromiseFull', {"success": "success"}, callbackLikePromiseFull);
            adv._callWorker('callbackLikePromiseFull', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            }).catch(done);
        });

        it('is a callbackFull', function(done) {
            function callbackFull(payload, next) {
                next(null, "success", { greet: "Hello " + payload.name });
            }
            adv.addSpecification('callbackFull', {"success": "success"}, callbackFull);
            adv._callWorker('callbackFull', { name: "Andrew" }).then((wr) => {
                expect(wr).to.eql(desiredResult);
                done();
            });
        });

    });

    it('can traverse', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'validate-payload',
            { "success": ["construct-url"] },
            validatePayload
        );

        adv.addSpecification(
            'construct-url',
            { "success": ["do-request"] },
            function(payload) {
                return {
                    _resolution: 'success',
                    url: 'http://greeter.com/hello/' + payload.name
                };
            }
        );

        adv.addSpecification(
            'do-request',
            { "success": ["add-to-database"] },
            function(payload) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({ greeting: "Hello " + payload.url.replace(/.*\//, '') });
                    }, 89);
                });
            }
        );

        adv.run('validate-payload').then(function(advResult) {
            expect(advResult.srcQueue).to.eql('validate-payload');
            expect(advResult.dstQueues).to.eql(["construct-url"]);
        }).catch(done);

        adv.run('construct-url').then(function(advResult) {
            expect(advResult.srcQueue).to.eql('construct-url');
            expect(advResult.dstQueues).to.eql(["do-request"]);
        }).catch(done);

        adv.run('do-request').then(function(advResult) {
            expect(advResult.srcQueue).to.eql('do-request');
            expect(advResult.dstQueues).to.eql(["add-to-database"]);
            done();
        }).catch(done);


        exchange.postMessagePayload('validate-payload', {name: 'Robert'})
            .catch(done);

    });

});
