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

    it('can do promises (also destination string, instead of array)', function(done) {

        var exchange = getExchange(),
            adv = new Advancer(exchange);

        adv.addSpecification(
            'validate-payload',
            { "success": "log-success" },
            function() {
                return new Promise((resolve) => {
                    resolve({message: 'hello'});
                });
            }
        );

        adv.run('validate-payload')
            .then(function(advResult) {
                expect(advResult.srcQueue).to.equal('validate-payload');
                expect(advResult.dstQueues).to.eql(["log-success"]);
                expect(advResult.newMessage).to.haveOwnProperty('payload');
                expect(advResult.newMessage.payload).to.eql({message: 'hello'});
                expect(advResult.newMessage).to.haveOwnProperty('initId');
                done();
            });

        exchange.postMessagePayload('validate-payload', {name: "Bob"});

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
            return function(processId, initId /* , queue, message */) {
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

});
