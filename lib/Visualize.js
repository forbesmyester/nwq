import r_map from 'ramda/src/map';
import r_mapObj from 'ramda/src/mapObj';
import r_values from 'ramda/src/values';
import r_mapObjIndexed from 'ramda/src/mapObjIndexed';
import r_reduce from 'ramda/src/reduce';
import r_defaultTo from 'ramda/src/defaultTo';
import r_assoc from 'ramda/src/assoc';
import r_assocPath from 'ramda/src/assocPath';
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
        this._active = null;
        this._ids = [];

        advancer.on('loadingMessage', this._loadingMessage.bind(this));
        advancer.on('loadedMessage', this._loadedMessage.bind(this));
        advancer.on('postingResult', this._postingResult.bind(this));
        advancer.on('postedResult', this._postedResult.bind(this));
        advancer.on('removingInput', this._removingInput.bind(this));
        advancer.on('removedInput', this._removedInput.bind(this));
    }

    _reprocessLoaded([queue, resolution, destination, message]) {

        let destinations = r_concat(
            r_defaultTo(
                [],
                r_path([queue, resolution, 'destinations'], this._qr)
            ),
            [destination]
        );

        this._qr = r_assocPath(
            [queue, resolution],
            {
                destinations: destinations,
                message: message
            },
            this._qr
        );

    }

    _addQueue(queue) {
        this._qr = r_assoc(
            queue,
            r_defaultTo({}, this._qr[queue]),
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
        var loaded = [
            r_last(message.path).replace(/\:[^\:].*/, ''),
            resolution,
            queue,
            message
        ];
        this._reprocessLoaded(loaded);
        this.emit('need-redraw', this._getGraph());
    }

    _loadedMessage(processId, queue, message) {
        this._active = ['i', message.initId];
        this._addQueue(queue);
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
            return r_reduce(function (acc, res) {
                acc[r_nth(0, res)] = r_concat(acc[r_nth(0, res)], r_nth(1, res));
                return acc;
            }, {}, resolutions);
        }

        var r = r_mapObj(getResolutions, this._qr);

        return r;
    }

    _refer(ss, message) {
        var k = r_map(function (s) {
            return s.replace(/[^a-z0-9_]/g, '_');
        }, ss).join(":");
        this._ids[k] = message;
        return '"' + k + '"';
    }

    getData(id) {
        id = id.replace(/^"/, '').replace(/"$/, '');
        return this._ids[id];
    }

    _getGraph() {

        var graphData = this._qr,
            that = this;

        // in the form [key, [array_of_subkey]]
        var keysAndSubkeys = r_values(r_mapObjIndexed(
            function (v, k) {
                return [k, r_keys(v)];
            },
        graphData));

        // in the form [[key1, subkey_1], [key1, subkey_2]]
        var paths = r_reduce(function (acc, [queue, resolutions]) {
            return r_concat(acc, r_map(function (res) {
                return [queue, res];
            }, resolutions));
        }, [], keysAndSubkeys);

        // Needed for adding queues which have not yet had
        // data forwarded onto anywhere
        function buildBase(gd) {
            return r_reduce(function (acc, k) {
                return r_assocPath([k], { _: null }, acc);
            }, {}, r_keys(gd));
        }

        var graphResult = r_reduce(function (acc, gdPath) {
            // a list of queues that the data went to
            var gdLinks = r_defaultTo([], r_path(r_concat(gdPath, ['destinations']), graphData));

            var lastMessage = r_path(r_concat(gdPath, ['message']), graphData);

            // the { target: table.field } pattern from db-diayaml
            var newLinks = r_map((item) => {
                var r = {
                    diaprops: {
                        id: that._refer(
                            r_concat(gdPath, [item]),
                            lastMessage
                        )
                    }
                };
                if (lastMessage.initId === that._active[1]) {
                    r.diaprops.color = 'red';
                    r.diaprops.style = 'dashed';
                }
                r.target = item + '._';
                return r;
            }, gdLinks);

            // put it into the links
            return r_assocPath(r_concat(gdPath, ['links']), newLinks, acc);
        }, buildBase(graphData), paths);

        return graphResult;
    }



}
