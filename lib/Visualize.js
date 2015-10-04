import r_map from 'ramda/src/map';
import r_mapObj from 'ramda/src/mapObj';
import r_values from 'ramda/src/values';
import r_mapObjIndexed from 'ramda/src/mapObjIndexed';
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
import {EventEmitter} from 'events';

export default class Visualize extends EventEmitter {

    constructor(advancer) {
        super();
        this._qr = {};
        this._loaded = {};
        this._active = null;

        advancer.on('loadingMessage', this._loadingMessage.bind(this));
        advancer.on('loadedMessage', this._loadedMessage.bind(this));
        advancer.on('postingResult', this._postingResult.bind(this));
        advancer.on('postedResult', this._postedResult.bind(this));
        advancer.on('removingInput', this._removingInput.bind(this));
        advancer.on('removedInput', this._removedInput.bind(this));
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

    _getResolution(message) {
        return r_last(message.path).replace(/.*\:/, '');
    }

    _postingResult(processId, queue, message) {
        this._active = ['i', message.initId];
        var resolution = this._getResolution(message);
        this._addQueue(queue, resolution);
        this._loaded[message.initId][1] = resolution;
        this._loaded[message.initId][2][queue] = r_inc(
            r_defaultTo(0, this._loaded[message.initId][2][queue])
        );
        this._reprocessLoaded();
        this.emit('need-redraw', this._getGraph());
    }

    _loadedMessage(processId, queue, message) {
        this._active = ['i', message.initId];
        this._addQueue(queue);
        this._loaded[message.initId] = [queue, null, {}];
        this.emit('need-redraw', this._getGraph());
    }

    _postedResult(processId, queue, message) {
        this._active = ['i', message.initId];
        this.emit('need-redraw', this._getGraph());
    }

    _removingInput(processId, queue, message) {
        this._active = ['i', message.initId];
        this.emit('need-redraw', this._getGraph());
    }

    _removedInput(processId, queue, message) {
        this._active = ['i', message.initId];
        this.emit('need-redraw', this._getGraph());
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

    _getGraph() {
        let graphData = this._getGraphData();

        // in the form [key, [array_of_subkey]]
        let keysAndSubkeys = r_values(r_mapObjIndexed(
            (v, k) => {
                return [k, r_keys(v)];
            },
            graphData
        ));

        // in the form [[key1, subkey_1], [key1, subkey_2]]
        let paths = r_reduce(
            (acc, [queue, resolutions]) => {
                return r_concat(
                    acc,
                    r_map((res) => [queue, res], resolutions)
                );
            },
            [],
            keysAndSubkeys
        );

        // Needed for adding queues which have not yet had
        // data forwarded onto anywhere
        function buildBase(gd) {
            return r_reduce(
                (acc, k) => {
                    return r_assocPath([k], {}, acc);
                },
                {},
                r_keys(gd)
            );
        }

        return r_reduce(
            (acc, gdPath) => {
                // a list of queues that the data went to
                let gdLinks = r_defaultTo([], r_path(
                    gdPath,
                    graphData
                ));

                // the { target: table.field } pattern from db-diayaml
                let newLinks = r_map(
                    (item) => { return { target: item + '._' }; },
                    gdLinks
                );

                // put it into the links
                return r_assocPath(
                    r_concat(gdPath, ['links']),
                    newLinks,
                    acc
                );
            },
            buildBase(graphData),
            paths
        );

    }

}
