import r_mapObj from 'ramda/src/mapObjIndexed';
import r_reduce from 'ramda/src/reduce';
import r_defaultTo from 'ramda/src/defaultTo';
import r_assoc from 'ramda/src/assoc';
import r_assocPath from 'ramda/src/assocPath';
import r_inc from 'ramda/src/inc';
import r_uniq from 'ramda/src/uniq';
import r_path from 'ramda/src/path';
import r_last from 'ramda/src/last';
import r_concat from 'ramda/src/concat';
import r_keys from 'ramda/src/keys';
import r_nth from 'ramda/src/nth';

export default class Visualize {

    constructor() {
        this._qr = {};
        this._loaded = {};
        this._active = null;
    }

    _reprocessLoaded() {
        r_mapObj(
            ([queue, resolution, destinations]) => {

                let current = r_path([queue], this._qr);
                let theNew = r_uniq(r_concat(
                    current,
                    [[resolution, r_keys(destinations)]]
                ));

                this._qr = r_assocPath(
                    [queue],
                    theNew,
                    this._qr
                );

            },
            this._loaded
        );
    }

    _addQueue(queue) {
        this._qr = r_assoc(
            queue,
            r_defaultTo([], this._qr[queue]),
            this._qr
        );
    }

    _loadingMessage(processId, queue) {
        this._addQueue(queue);
        this._active = ['q', queue];
    }

    _postingResult(processId, queue, message) {
        this._active = ['i', message.initId];
        var resolution = r_last(message.path).replace(/.*\:/, '');
        this._addQueue(queue, resolution);
        this._loaded[message.initId][1] = resolution;
        this._loaded[message.initId][2][queue] = r_inc(
            r_defaultTo(0, this._loaded[message.initId][2][queue])
        );
        this._reprocessLoaded();
    }

    _loadedMessage(processId, queue, message) {
        this._active = ['i', message.initId];
        this._addQueue(queue);
        this._loaded[message.initId] = [queue, null, {}];
    }

    _postedResult(processId, queue, message) {
        this._active = ['i', message.initId];
    }

    _removingInput(processId, queue, message) {
        this._active = ['i', message.initId];
    }

    _removedInput(processId, queue, message) {
        this._active = ['i', message.initId];
    }

    _getGraphData() {

        function getResolutions(resolutions) {
            return r_reduce(
                (acc, res) => {
                    acc[r_nth(0, res)] = r_concat(
                        acc[r_nth(0, res)],
                        r_nth(1, res)
                    );
                    return acc;
                },
                {},
                resolutions
            );
        }

        var r = r_mapObj(getResolutions, this._qr);

        return r;
    }
}
