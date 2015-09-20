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

});
