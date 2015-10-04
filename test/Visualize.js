"use strict";

import {expect} from "chai";
import Visualize from "../lib/Visualize";

describe('can build the correct overall field structure', function() {

        // adv.on('loadingMessage', recordEvent('loadingMessage'));
        // adv.on('loadedMessage', recordEvent('loadedMessage'));
        // adv.on('postingResult', recordEvent('postingResult'));
        // adv.on('postedResult', recordEvent('postedResult'));
        // adv.on('removingInput', recordEvent('removingInput'));
        // adv.on('removedInput', recordEvent('removedInput'));
        // process queue message

    // {
    //     srcMessage: {
    //         payload: { haiku: 'I lke dictionary' },
    //         path: [],
    //         transportId: 'X2lu8ko50000',
    //         initId: 'X2lu8ko50000' },
    //     newMessage: {
    //         payload: { resolution: 'spelling-error', payload: 'I lke dictionary' },
    //         path: [ 'check-spelling:success' ],
    //         initId: 'X2lu8ko50000',
    //         transportId: 'X2lu8qdk0000' } }


    it('does', function() {
        var v = new Visualize({ on: function() {} });
        v._loadingMessage('a', 'q1', {});
        expect(v._getGraph()).to.eql({ q1: {} });
        v._loadedMessage('a', 'q1', { initId: 'xyz' });
        expect(v._getGraph()).to.eql({ q1: {} });
        v._postingResult('a', 'q2', { initId: 'xyz', path: ['a:success'] });
        expect(v._getGraph()).to.eql({
            q1: { success: { links: [ { target: 'q2._' } ] } },
            q2: {}
        });
    });
});
