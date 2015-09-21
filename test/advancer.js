"use strict";

import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";
import SQSExchange from "../lib/SQSExchange";
import advancer from "../lib/advancer";
import AWS from "aws-sdk";

describe('advancer', function() {

    this.timeout(20000);

    function validateMessage(messageBody, next) {
        if (!messageBody.hasOwnProperty('name')) { return next(null, "done", {}); }
        if (messageBody.name.length < 5) {
            return next(null, {name: "Teapot"});
        }
        next(null, {name: messageBody.name});
    }

    function constructUrl({ name }, next) {
        next(null, "find-alternative", { name: "http://www.google.com?q=" + name });
    }

    function doGoogleSearch(messageBody, next) {
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

        function checkIt(err, resp) {
            expect(err).to.equal(null);
            expect(resp.fromQueue).to.equal('do-google-search');
            expect(resp.toQueue).to.equal('do-google-search/err');
            memoryExchange.getMessage('do-google-search/err', function(err2, body) {
                expect(err2).to.equal(null);
                expect(body.err).to.eql(500);
                expect(body.path).to.eql(["validate-msg:success", "construct-url:find-alternative", "do-google-search:err"]);
                expect(body.body).to.equal(undefined);
                expect(body.previousBody).to.eql({name: "http://www.google.com?q=Teapot"});
                expect(body).to.haveOwnProperty('id');
                done();
            });
        }

        var serviceDesc = {
            "validate-msg": {
                resolutions: { "success": "construct-url" },
                handler: validateMessage
            },
            "construct-url": {
                resolutions: { "find-alternative": "do-google-search", "success": "download-image" },
                handler: constructUrl
            },
            "do-google-search": {
                resolutions: {},
                handler: doGoogleSearch
            }
        };

        advancer(
            'validate-msg',
            serviceDesc['validate-msg'].resolutions,
            memoryExchange,
            serviceDesc['validate-msg'].handler,
            function(err, details) {
                expect(err).to.equal(null);
                expect(details.fromQueue).to.equal('validate-msg');
                expect(details.toQueue).to.equal('construct-url');
            }
        );

        advancer(
            'construct-url',
            serviceDesc['construct-url'].resolutions,
            memoryExchange,
            serviceDesc['construct-url'].handler,
            function(err, { fromQueue, toQueue }) {
                expect(err).to.equal(null);
                expect(fromQueue).to.equal('construct-url');
                expect(toQueue).to.equal('do-google-search');
            }
        );

        advancer(
            'do-google-search',
            serviceDesc['do-google-search'].resolutions,
            memoryExchange,
            serviceDesc['do-google-search'].handler,
            checkIt
        );

        memoryExchange.postMessageBody('validate-msg', {name: "Bob"});

    });

    it('will advance to nowhere if it advances to `null`', function(done) {

        const memoryExchange = Queue.getMemory();

        advancer(
            'validate-msg',
            { "success": "construct-url", "done": null },
            memoryExchange,
            validateMessage,
            function(err, details) {
                expect(err).to.equal(null);
                expect(details.fromQueue).to.equal('validate-msg');
                expect(details.toQueue).to.equal(null);
                done();
            }
        );

        memoryExchange.postMessageBody('validate-msg', {});
    });

    it('has a forever function which will run n versions of a function, always', function(done) {

        // This needs better tests
        //
        //  * How do we know they are concurrent?
        //  * We know `done()` is not called multiple times, but does it actually stop?
        //
        // Maybe startup notification may address these issues? Will need to think a bit more.

        var c = 0,
            results = [];

        function doForever(next) {
            setTimeout(function() {
                if (c >= 5) {
                    next(new Error(">5"));
                }
                next(null, ++c);
            }, 5);
        }

        advancer._forever(
            doForever,
            10,
            function(result) {
                results.push(result);
            },
            function(err) {
                expect(err.message).to.equal(">5");
                expect(results).to.eql([1, 2, 3, 4, 5]);
                done();
            }
        );
    });

    it('will continue to advance if advancer.forever() is used', function(done) {

        const memoryExchange = Queue.getMemory();
        var callCount = 0;

        var i = 0;
        function somethingSlow(body, next) {
            setTimeout(function() {
                next(null, { i: i++ });
            }, 500);
        }

        advancer.forever(
            3,
            'something-slow',
            {},
            memoryExchange,
            somethingSlow,
            function(result) {
                expect(result.fromQueue).to.equal('something-slow');
                expect(result.toQueue).to.equal('something-slow/success');
                expect(result.message.body.i).to.be.lessThan(10);
                if (++callCount > 9) {
                    done();
                }
            },
            function() {
                expect.fail();
            }
        );

        memoryExchange.postMessageBody('something-slow', {});
        memoryExchange.postMessageBody('something-slow', {});
        memoryExchange.postMessageBody('something-slow', {});
    });

});
