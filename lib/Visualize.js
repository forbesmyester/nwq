import {map} from 'ramda';
import {mapObj} from 'ramda';
import {values} from 'ramda';
import {mapObjIndexed} from 'ramda';
import {reduce} from 'ramda';
import {defaultTo} from 'ramda';
import {assocPath} from 'ramda';
import {path} from 'ramda';
import {last} from 'ramda';
import {concat} from 'ramda';
import {keys} from 'ramda';
import {nth} from 'ramda';
import {EventEmitter} from 'events';

export default class Visualize extends EventEmitter {

    constructor(advancer) {
        super();
        this._qr = {};
        this._active = null;
        this._ids = [];

        advancer.on('loadingMessage', this._loadingMessage.bind(this));
        advancer.on('loadedMessage', this._loadedMessage.bind(this));
        advancer.on('noPostingRoute', this._noPostingRoute.bind(this));
        advancer.on('postingResult', this._postingResult.bind(this));
        advancer.on('postedResult', this._postedResult.bind(this));
        advancer.on('removingInput', this._removingInput.bind(this));
        advancer.on('removedInput', this._removedInput.bind(this));
    }

    _reprocessLoaded([queue, resolution, destination, message]) {

        let destinations = concat(
            defaultTo(
                [],
                path([queue, resolution, 'destinations'], this._qr)
            ),
            [destination]
        );

        this._qr = assocPath(
            [queue, resolution],
            {
                destinations: destinations,
                message: message
            },
            this._qr
        );

    }

    _addQueue(/* queue, resolution */) { // Resolution may not be passed...
        var path = Array.prototype.slice.call(arguments, 0);
        this._qr = assocPath(
            path,
            defaultTo({}, path(path, this._qr)),
            this._qr
        );
    }

    _loadingMessage(processId, queue) {
        this._addQueue(queue);
        this._active = ['q', queue];
    }

    _getResolution(message) {
        return last(message.path).replace(/.*\:/, '');
    }

    _noPostingRoute(processId, queue, resolution) {
        this._addQueue(queue, resolution);
    }

    _postingResult(processId, srcQueue, dstQueue, message) {
        this._active = ['i', message.initId];
        var resolution = this._getResolution(message);
        this._addQueue(dstQueue);
        var loaded = [
            last(message.path).replace(/\:[^\:].*/, ''),
            resolution,
            dstQueue,
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

    _postedResult(processId, srcQueue, dstQueue, message) {
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
            return reduce(function (acc, res) {
                acc[nth(0, res)] = concat(acc[nth(0, res)], nth(1, res));
                return acc;
            }, {}, resolutions);
        }

        var r = mapObj(getResolutions, this._qr);

        return r;
    }

    _refer(ss, message) {
        var k = map(function (s) {
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
        var keysAndSubkeys = values(mapObjIndexed(
            function (v, k) {
                return [k, keys(v)];
            },
        graphData));

        // in the form [[key1, subkey_1], [key1, subkey_2]]
        var paths = reduce(function (acc, [queue, resolutions]) {
            return concat(acc, map(function (res) {
                return [queue, res];
            }, resolutions));
        }, [], keysAndSubkeys);

        // Needed for adding queues which have not yet had
        // data forwarded onto anywhere
        function buildBase(gd) {
            return reduce(function (acc, k) {
                return assocPath([k], { _: null }, acc);
            }, {}, keys(gd));
        }

        var graphResult = reduce(function (acc, gdPath) {
            // a list of queues that the data went to
            var gdLinks = defaultTo([], path(concat(gdPath, ['destinations']), graphData));

            var lastMessage = path(concat(gdPath, ['message']), graphData);

            // the { target: table.field } pattern from db-diayaml
            var newLinks = map((item) => {
                var r = {
                    diaprops: {
                        id: that._refer(
                            concat(gdPath, [item]),
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
            return assocPath(concat(gdPath, ['links']), newLinks, acc);
        }, buildBase(graphData), paths);

        return graphResult;
    }



}
