import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";
import SQSExchange from "../lib/SQSExchange";
import AWS from "aws-sdk";

describe(process.env.NWQ_TEST_SQS ? 'SQSExchange' : 'MemoryExchange', function() {

    var getExchange = function(opts) {
        if (process.env.NWQ_TEST_SQS) {
            let sqs = new AWS.SQS({region: "eu-west-1"});
            return new SQSExchange(sqs, opts);
        }
        return new MemoryExchange(opts);
    };

    var getQueueName = () => 't' + (new Date().getTime());

    it('can get messages, which will then become invisible, for a while', function(done) {

        this.timeout(5000);

        var t = new Date().getTime(),
            mx = getExchange({VisibilityTimeout: '1'});

        var theQ = getQueueName();

        mx.postMessagePayload(theQ, {eyes: 'blue'})
            .then(() => {
                return mx.getMessage(theQ).then(({payload}) => { // As Promise
                    expect(payload.eyes).to.equal('blue');
                });
            })
            .then(() => {
                mx.getMessage(theQ).then(({payload}) => { // As Promise
                    expect(new Date().getTime()).to.be.above(t + 1000);
                    expect(payload.eyes).to.equal('blue');
                    done();
                });
            });
    });

    function wait(t) {
        return function() {
            return new Promise(function(resolve) {
                setTimeout(resolve, t);
            });
        };
    }

    function postMsg(mmx, q, color) {
        return function() {
            return mmx.postMessagePayload(q, {eyes: color});
        };
    }

    function delMsg(mmx, q) {
        return function(transportId) {
            return mmx.removeMessage(q, transportId);
        };
    }

    it('can remove messages', function(done) {

        this.timeout(20000);

        var mx = getExchange({VisibilityTimeout: '1'}),
            eyes = [],
            transportIds = {},
            theQ = getQueueName();


        function getMsg(mmx, q) {
            return function() {
                return mmx.getMessage(q)
                    .then(function(msg) {
                        transportIds[msg.payload.eyes] = msg.transportId;
                        eyes.push(msg.payload.eyes);
                    });
            };
        }

        function getTransportId(eyeColor) {
            return function() {
                return transportIds[eyeColor];
            };
        }

        postMsg(mx, theQ, 'blue')()
            .then(getMsg(mx, theQ))
            .then(postMsg(mx, theQ, 'brown'))
            .then(wait(5000))
            .then(getTransportId('blue'))
            .then(delMsg(mx, theQ))
            .then(wait(5000))
            .then(getMsg(mx, theQ))
            .then(function() {
                expect(eyes).to.eql(['blue', 'brown']);
                done();
            })
            .catch(function(err) {
                /* eslint no-console: 0 */
                console.log(err);
                this.fail();
            });
    });

    it('removes messages automatically after a retention period', function(done) {

        this.timeout(120000);

        var mx = getExchange({VisibilityTimeout: '1', MessageRetentionPeriod: '60', _messagePollTime: 1}),
            eyes = [],
            transportIds = {},
            theQ = getQueueName();

        function getMsg(mmx, q) {
            return function() {
                return mmx.getMessage(q)
                    .then(function(msg) {
                        transportIds[msg.payload.eyes] = msg.transportId;
                        eyes.push(msg.payload.eyes);
                    });
            };
        }

        postMsg(mx, theQ, 'blue')()
            .then(wait(30000))
            .then(getMsg(mx, theQ))
            .then(postMsg(mx, theQ, 'brown'))
            .then(wait(50000))
            .then(getMsg(mx, theQ))
            .then(function() {
                expect(eyes).to.eql(['blue', 'brown']);
                done();
            })
            .catch(function(err) {
                /* eslint no-console: 0 */
                console.log(err);
                this.fail();
            });

    });

});
