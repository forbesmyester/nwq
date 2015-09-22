import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";

describe('MemoryExchange', function() {
    var mx = new MemoryExchange({visibility: 1000});
    it('can get messages, which will then become invisible, for a while', function(done) {
        var t = new Date().getTime();
        mx.postMessage('q', {eyes: 'blue'}, (err) => {
            expect(err).to.equal(null);
            mx.getMessage('q', (err2, msg) => {
                expect(err2).to.equal(null);
                expect(msg.eyes).to.equal('blue');
            });
            mx.getMessage('q', (err2, msg) => {
                expect(new Date().getTime()).to.be.above(t + 1000);
                expect(err2).to.equal(null);
                expect(msg.eyes).to.equal('blue');
                done();
            });
        });
    });
});
