"use strict";

import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";
import SQSExchange from "../lib/SQSExchange";
import advancer from "../lib/advancer";
import AWS from "aws-sdk";

describe('advancer', function() {

    this.timeout(20000);

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

    var Queue = {
        getSQS: function() {
            let sqs = new AWS.SQS({region: "eu-west-1"});
            return new SQSExchange(sqs);
        },
        getMemory: function() {
            return new MemoryExchange();
        }
    };

    it('can run a queue', function(done) {

        // You can swap this to SQS to test that too!
        // const memoryExchange = Queue.getSQS();
        const memoryExchange = Queue.getMemory();

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

        var initId = null;

        function checkIt(err, advResult) {
            expect(err).to.equal(null);
            expect(advResult.fromQueue).to.equal('do-google-search');
            expect(advResult.toQueue).to.equal('do-google-search/err');
            expect(advResult.message.initId).to.equal(initId);
            memoryExchange.getMessage('do-google-search/err', function(err2, message) {
                expect(err2).to.equal(null);
                expect(message.err).to.eql(500);
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
            memoryExchange,
            serviceDesc['validate-payload'].worker,
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
            memoryExchange,
            serviceDesc['construct-url'].worker,
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
            memoryExchange,
            serviceDesc['do-google-search'].worker,
            checkIt
        );

        memoryExchange.postMessagePayload('validate-payload', {name: "Bob"});

    });

    it('will advance to nowhere if it advances to `null`', function(done) {

        const memoryExchange = Queue.getMemory();

        advancer(
            'validate-payload',
            { "success": "construct-url", "done": null },
            memoryExchange,
            validatePayload,
            function(err, advResult) {
                expect(err).to.equal(null);
                expect(advResult.fromQueue).to.equal('validate-payload');
                expect(advResult.toQueue).to.equal(null);
                done();
            }
        );

        memoryExchange.postMessagePayload('validate-payload', {});
    });

    it('can pass into multiple queues', function(done) {

        const memoryExchange = Queue.getMemory();

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
            memoryExchange,
            serviceDesc['validate-payload'].worker,
            goneIntoQueue
        );
        advancer(
            'save-in-db',
            serviceDesc['save-in-db'].resolutions,
            memoryExchange,
            serviceDesc['save-in-db'].worker,
            goneIntoQueue
        );
        advancer(
            'analyze-english-quality-later',
            serviceDesc['analyze-english-quality-later'].resolutions,
            memoryExchange,
            serviceDesc['analyze-english-quality-later'].worker,
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

        memoryExchange.postMessagePayload('validate-payload', { name: "Sir Arthur" });

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

        const memoryExchange = Queue.getMemory();
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
            memoryExchange,
            somethingSlow,
            function() {
                // This is the begin job worker.
            },
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

        memoryExchange.postMessagePayload('something-slow', {});
        memoryExchange.postMessagePayload('something-slow', {});
        memoryExchange.postMessagePayload('something-slow', {});
    });

});
