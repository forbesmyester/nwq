import {expect} from "chai";
import MemoryExchange from "../lib/MemoryExchange";

describe('MemoryExchange', function() {

    it('can get messages, which will then become invisible, for a while', function(done) {
        var t = new Date().getTime(),
            mx = new MemoryExchange({visibility: 1000});

        mx.postMessage('q', {eyes: 'blue'}, (err) => {
            expect(err).to.equal(null);
            mx.getMessage('q').then((payload) => { // As Promise
                expect(payload.eyes).to.equal('blue');
            });
            mx.getMessage('q', (err2, payload) => { // As Calback
                expect(new Date().getTime()).to.be.above(t + 1000);
                expect(err2).to.equal(null);
                expect(payload.eyes).to.equal('blue');
                done();
            });
        });
    });

});
