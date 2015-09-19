"use strict";

import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";
import advancer from "../lib/advancer";

describe('advancer', function() {

    function validateMessage(messageBody, next) {
        if (
            !messageBody.hasOwnProperty('name') || messageBody.name.length < 5
        ) { return next(null, {name: "Teapot"}); }
        next(null, {name: messageBody.name});
    }

    function constructUrl({ name }, next) {
        next(null, "find-alternative", { name: "http://www.google.com?q=" + name });
    }

    function doGoogleSearch(messageBody, next) {
        next(500);
    }

    it('can run a queue', function(done) {

        const memoryExchange = new MemoryExchange();

        function checkIt(err, { fromQueue, toQueue }) {
            expect(err).to.equal(null);
            expect(fromQueue).to.equal('do-google-search');
            expect(toQueue).to.equal('do-google-search/err');
            expect(memoryExchange._dump()).to.eql({
                "validate-msg": [],
                "construct-url": [],
                "do-google-search": [],
                "do-google-search/err": [{
                    err: 500,
                    path: ["validate-msg:success", "construct-url:find-alternative", "do-google-search:err"],
                    body: undefined,
                    previousBody: {name: "http://www.google.com?q=Teapot"}
                }]
            });
            done();
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
            function(err, { fromQueue, toQueue }) {
                expect(err).to.equal(null);
                expect(fromQueue).to.equal('validate-msg');
                expect(toQueue).to.equal('construct-url');
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

});
