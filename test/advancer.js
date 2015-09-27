"use strict";

import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";
import SQSExchange from "../lib/SQSExchange";
import advancer from "../lib/advancer";
import AWS from "aws-sdk";

describe('advancer with ' + (process.env.NWQ_TEST_SQS ? 'SQS' : 'Memory'), function() {

    this.timeout(10000);

    function validatePayload(payload, next) {
        if (!payload.hasOwnProperty('name')) { return next(null, "done", {}); }
        if (payload.name.length < 5) {
            return next(null, {name: "Teapot"});
        }
        next(null, {name: payload.name});
    }

    function constructUrl({ name }, next) {
        next(null, "find-alternative", { name: "http://www.google.com?q=" + name });
    }

    function doGoogleSearch(payload, next) {
        next(500);
    }

    function getExchange() {
        if (process.env.NWQ_TEST_SQS) {
            let sqs = new AWS.SQS({region: "eu-west-1"});
            return new SQSExchange(sqs);
        }
        return new MemoryExchange();
    }

    it('advance, with working events', function(done) {

        var exchange = getExchange(),
            events = [];

        function recordEvent(eventName) {
            return function(processId, initId /* , queue, message */) {
                events.push([eventName, processId, initId]);
            };
        }

        advancer(
            'validate-payload',
            { "success": ["construct-url", "log-success"] },
            exchange,
            validatePayload,
            {
                onLoadingMessage: recordEvent('loadingMessage'),
                onLoadedMessage: recordEvent('loadedMessage'),
                onPostingResult: recordEvent('postingResult'),
                onPostedResult: recordEvent('postedResult'),
                onRemovingInput: recordEvent('removingInput'),
                onRemovedInput: recordEvent('removedInput')
            },
            function(err, advResult) {
                expect(err).to.equal(null);
                expect(advResult.fromQueue).to.equal('validate-payload');
                expect(advResult.toQueue).to.equal('construct-url');
                expect(advResult).to.haveOwnProperty('message');
                expect(advResult.message).to.haveOwnProperty('initId');
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
                events.forEach(function(item, index) {
                    expect(item[1]).to.eql(events[1][1]);
                    if (index !== 0) {
                        expect(item[2]).to.eql(events[1][2]);
                    }
                });
                done();
            }
        );

        exchange.postMessagePayload('validate-payload', {name: "Bob"});

    });


    it('can run a queue', function(done) {

        const exchange = getExchange();

        var serviceDesc = {
            "validate-payload": {
                resolutions: { "success": "construct-url" },
                worker: validatePayload
            },
            "construct-url": {
                resolutions: { "find-alternative": "do-google-search", "success": "download-image" },
                worker: constructUrl
            },
            "do-google-search": {
                resolutions: {},
                worker: doGoogleSearch
            }
        };

        var initId = null,
            events = [];

        if (!process.env.NWQ_TEST_SQS) {
            exchange.on('createQueue', () => {
                events.push('createQueue');
            });
            exchange.on('getMessage', () => {
                events.push('getMessage');
            });
            exchange.on('removeMessage', () => {
                events.push('removeMessage');
            });
            exchange.on('postMessage', () => {
                events.push('postMessage');
            });
        }

        function checkIt(err, advResult) {
            expect(err).to.equal(null);
            expect(advResult.fromQueue).to.equal('do-google-search');
            expect(advResult.toQueue).to.equal('do-google-search/err');
            expect(advResult.message.initId).to.equal(initId);
            exchange.getMessage('do-google-search/err').then(function(message) {
                expect(message.err).to.eql(500);
                if (!process.env.NWQ_TEST_SQS) {
                    expect(events).to.include.members(['postMessage', 'removeMessage', 'getMessage', 'createQueue']);
                }
                expect(message.path).to.eql(["validate-payload:success", "construct-url:find-alternative", "do-google-search:err"]);
                expect(message.payload).to.equal(undefined);
                expect(message.previousPayload).to.eql({name: "http://www.google.com?q=Teapot"});
                expect(message).to.haveOwnProperty('transportId');
                expect(message.payload).to.equal(undefined);
                expect(message.initId).to.equal(initId);
                done();
            });
        }

        advancer(
            'validate-payload',
            serviceDesc['validate-payload'].resolutions,
            exchange,
            serviceDesc['validate-payload'].worker,
            {},
            function(err, advResult) {
                expect(err).to.equal(null);
                expect(advResult.fromQueue).to.equal('validate-payload');
                expect(advResult.toQueue).to.equal('construct-url');
                expect(advResult).to.haveOwnProperty('message');
                expect(advResult.message).to.haveOwnProperty('initId');
                initId = advResult.message.initId;
            }
        );

        advancer(
            'construct-url',
            serviceDesc['construct-url'].resolutions,
            exchange,
            serviceDesc['construct-url'].worker,
            {},
            function(err, advResult) {
                expect(err).to.equal(null);
                expect(advResult.fromQueue).to.equal('construct-url');
                expect(advResult.toQueue).to.equal('do-google-search');
                expect(advResult.message.initId).to.equal(initId);
            }
        );

        advancer(
            'do-google-search',
            serviceDesc['do-google-search'].resolutions,
            exchange,
            serviceDesc['do-google-search'].worker,
            {},
            checkIt
        );

        exchange.postMessagePayload('validate-payload', {name: "Bob"});

    });

    it('will advance to nowhere if it advances to `null`', function(done) {

        const exchange = getExchange();

        advancer(
            'validate-payload',
            { "success": "construct-url", "done": null },
            exchange,
            validatePayload,
            {},
            function(err, advResult) {
                expect(err).to.equal(null);
                expect(advResult.fromQueue).to.equal('validate-payload');
                expect(advResult.toQueue).to.equal(null);
                done();
            }
        );

        exchange.postMessagePayload('validate-payload', {});
    });

    it('can pass into multiple queues', function(done) {

        const exchange = getExchange();

        var askDictionaryDotCom = function(payload, next) {
            setTimeout(function() {
                next(null, "spelling", { "words": "supar" });
            }, 120);
        };

        var saveInDb = function(payload, next) {
            setTimeout(function() {
                next(null, { ok: true });
            }, 5);
        };

        var intoQueues = [];

        var goneIntoQueue = function(err, advResult) {
            if (err) { return expect.fail(); }
            intoQueues.push(advResult.toQueue);
        };

        var serviceDesc = {
            "validate-payload": {
                resolutions: {
                    "success": ["save-in-db", "analyze-english-quality-later"]
                },
                worker: validatePayload
            },
            "save-in-db": {
                resolutions: {},
                worker: saveInDb
            },
            "analyze-english-quality-later": {
                resolutions: {},
                worker: askDictionaryDotCom
            }
        };

        advancer(
            'validate-payload',
            serviceDesc['validate-payload'].resolutions,
            exchange,
            serviceDesc['validate-payload'].worker,
            {},
            goneIntoQueue
        );
        advancer(
            'save-in-db',
            serviceDesc['save-in-db'].resolutions,
            exchange,
            serviceDesc['save-in-db'].worker,
            {},
            goneIntoQueue
        );
        advancer(
            'analyze-english-quality-later',
            serviceDesc['analyze-english-quality-later'].resolutions,
            exchange,
            serviceDesc['analyze-english-quality-later'].worker,
            {},
            function(err, qs) {
                goneIntoQueue(err, qs);
                expect(intoQueues).to.eql([
                    'save-in-db', // Entered second stage
                    'analyze-english-quality-later', // Entered second stage
                    'save-in-db/success', // save-in-db completed first
                    'analyze-english-quality-later/spelling' // This has just completed
                ]);
                done();
            }
        );

        exchange.postMessagePayload('validate-payload', { name: "Sir Arthur" });

    });

    it('has a forever function which will run n versions of a function, always', function(done) {

        var c = 0,
            results = [];

        function doForever(next) {
            c = c + 1;
            var myC = c;
            setTimeout(function() {
                if (myC > 5) {
                    return next(new Error(">5"));
                }
                next(null, myC);
            }, myC * 100);
        }

        advancer._forever(
            doForever,
            3,
            function() {
                results.push(0);
            },
            function(result) {
                results.push(result);
            },
            function(err) {
                expect(err.message).to.equal(">5");
                expect(results).to.eql([0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0]);
                done();
            }
        );

    });

    it('will continue to advance if advancer.forever() is used', function(done) {

        const exchange = getExchange();
        var callCount = 0;

        var i = 0;
        function somethingSlow(payload, next) {
            setTimeout(function() {
                next(null, { i: i++ });
            }, 50);
        }

        advancer.forever(
            2,
            'something-slow',
            {},
            exchange,
            somethingSlow,
            {},
            function() { }, // This is the begin job worker.
            function(advResult) {
                expect(advResult.fromQueue).to.equal('something-slow');
                expect(advResult.toQueue).to.equal('something-slow/success');
                expect(advResult.message.payload.i).to.be.lessThan(3);
                if (++callCount == 3) {
                    done();
                }
            },
            function() {
                expect.fail();
            }
        );

        exchange.postMessagePayload('something-slow', {});
        exchange.postMessagePayload('something-slow', {});
        exchange.postMessagePayload('something-slow', {});
    });

});
