'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _inherits(subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _ramdaSrcMap = require('ramda/src/map');

var _ramdaSrcMap2 = _interopRequireDefault(_ramdaSrcMap);

var _ramdaSrcMapObj = require('ramda/src/mapObj');

var _ramdaSrcMapObj2 = _interopRequireDefault(_ramdaSrcMapObj);

var _ramdaSrcValues = require('ramda/src/values');

var _ramdaSrcValues2 = _interopRequireDefault(_ramdaSrcValues);

var _ramdaSrcMapObjIndexed = require('ramda/src/mapObjIndexed');

var _ramdaSrcMapObjIndexed2 = _interopRequireDefault(_ramdaSrcMapObjIndexed);

var _ramdaSrcReduce = require('ramda/src/reduce');

var _ramdaSrcReduce2 = _interopRequireDefault(_ramdaSrcReduce);

var _ramdaSrcDefaultTo = require('ramda/src/defaultTo');

var _ramdaSrcDefaultTo2 = _interopRequireDefault(_ramdaSrcDefaultTo);

var _ramdaSrcAssoc = require('ramda/src/assoc');

var _ramdaSrcAssoc2 = _interopRequireDefault(_ramdaSrcAssoc);

var _ramdaSrcAssocPath = require('ramda/src/assocPath');

var _ramdaSrcAssocPath2 = _interopRequireDefault(_ramdaSrcAssocPath);

var _ramdaSrcInc = require('ramda/src/inc');

var _ramdaSrcInc2 = _interopRequireDefault(_ramdaSrcInc);

var _ramdaSrcPath = require('ramda/src/path');

var _ramdaSrcPath2 = _interopRequireDefault(_ramdaSrcPath);

var _ramdaSrcLast = require('ramda/src/last');

var _ramdaSrcLast2 = _interopRequireDefault(_ramdaSrcLast);

var _ramdaSrcConcat = require('ramda/src/concat');

var _ramdaSrcConcat2 = _interopRequireDefault(_ramdaSrcConcat);

var _ramdaSrcKeys = require('ramda/src/keys');

var _ramdaSrcKeys2 = _interopRequireDefault(_ramdaSrcKeys);

var _ramdaSrcNth = require('ramda/src/nth');

var _ramdaSrcNth2 = _interopRequireDefault(_ramdaSrcNth);

var _events = require('events');

var Visualize = (function (_EventEmitter) {
    _inherits(Visualize, _EventEmitter);

    function Visualize(advancer) {
        _classCallCheck(this, Visualize);

        _get(Object.getPrototypeOf(Visualize.prototype), 'constructor', this).call(this);
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

    _createClass(Visualize, [{
        key: '_reprocessLoaded',
        value: function _reprocessLoaded() {
            var _this = this;

            (0, _ramdaSrcMapObj2['default'])(function (_ref) {
                var _ref2 = _slicedToArray(_ref, 4);

                var queue = _ref2[0];
                var resolution = _ref2[1];
                var destinations = _ref2[2];
                var message = _ref2[3];

                _this._qr = (0, _ramdaSrcAssocPath2['default'])([queue, resolution], {
                    destinations: (0, _ramdaSrcKeys2['default'])(destinations),
                    message: message
                }, _this._qr);
            }, this._loaded);
        }
    }, {
        key: '_addQueue',
        value: function _addQueue(queue) {
            this._qr = (0, _ramdaSrcAssoc2['default'])(queue, (0, _ramdaSrcDefaultTo2['default'])([], this._qr[queue]), this._qr);
        }
    }, {
        key: '_loadingMessage',
        value: function _loadingMessage(processId, queue) {
            this._addQueue(queue);
            this._active = ['q', queue];
        }
    }, {
        key: '_getResolution',
        value: function _getResolution(message) {
            return (0, _ramdaSrcLast2['default'])(message.path).replace(/.*\:/, '');
        }
    }, {
        key: '_postingResult',
        value: function _postingResult(processId, queue, message) {
            this._active = ['i', message.initId];
            var resolution = this._getResolution(message);
            this._addQueue(queue, resolution);
            this._loaded[message.initId][1] = resolution;
            this._loaded[message.initId][2][queue] = (0, _ramdaSrcInc2['default'])((0, _ramdaSrcDefaultTo2['default'])(0, this._loaded[message.initId][2][queue]));
            this._loaded[message.initId][3] = message;
            this._reprocessLoaded();
            this.emit('need-redraw', this._getGraph());
        }
    }, {
        key: '_loadedMessage',
        value: function _loadedMessage(processId, queue, message) {
            this._active = ['i', message.initId];
            this._addQueue(queue);
            this._loaded[message.initId] = [queue, null, {}];
            this.emit('need-redraw', this._getGraph());
        }
    }, {
        key: '_postedResult',
        value: function _postedResult(processId, queue, message) {
            this._active = ['i', message.initId];
            this.emit('need-redraw', this._getGraph());
        }
    }, {
        key: '_removingInput',
        value: function _removingInput(processId, queue, message) {
            this._active = ['i', message.initId];
            this.emit('need-redraw', this._getGraph());
        }
    }, {
        key: '_removedInput',
        value: function _removedInput(processId, queue, message) {
            this._active = ['i', message.initId];
            this.emit('need-redraw', this._getGraph());
        }
    }, {
        key: '_getGraphData',
        value: function _getGraphData() {

            function getResolutions(resolutions) {
                return (0, _ramdaSrcReduce2['default'])(function (acc, res) {
                    acc[(0, _ramdaSrcNth2['default'])(0, res)] = (0, _ramdaSrcConcat2['default'])(acc[(0, _ramdaSrcNth2['default'])(0, res)], (0, _ramdaSrcNth2['default'])(1, res));
                    return acc;
                }, {}, resolutions);
            }

            var r = (0, _ramdaSrcMapObj2['default'])(getResolutions, this._qr);

            return r;
        }
    }, {
        key: '_refer',
        value: function _refer(ss, message) {
            var k = (0, _ramdaSrcMap2['default'])(function (s) {
                return s.replace(/[^a-z0-9_]/g, '_');
            }, ss).join(":");
            this._ids[k] = message;
            return '"' + k + '"';
        }
    }, {
        key: 'getData',
        value: function getData(id) {
            id = id.replace(/^"/, '').replace(/"$/, '');
            return this._ids[id];
        }
    }, {
        key: '_getGraph',
        value: function _getGraph() {

            var graphData = this._qr;

            // in the form [key, [array_of_subkey]]
            var keysAndSubkeys = (0, _ramdaSrcValues2['default'])((0, _ramdaSrcMapObjIndexed2['default'])(function (v, k) {
                return [k, (0, _ramdaSrcKeys2['default'])(v)];
            }, graphData));

            // in the form [[key1, subkey_1], [key1, subkey_2]]
            var paths = (0, _ramdaSrcReduce2['default'])(function (acc, _ref3) {
                var _ref32 = _slicedToArray(_ref3, 2);

                var queue = _ref32[0];
                var resolutions = _ref32[1];

                return (0, _ramdaSrcConcat2['default'])(acc, (0, _ramdaSrcMap2['default'])(function (res) {
                    return [queue, res];
                }, resolutions));
            }, [], keysAndSubkeys);

            // Needed for adding queues which have not yet had
            // data forwarded onto anywhere
            function buildBase(gd) {
                return (0, _ramdaSrcReduce2['default'])(function (acc, k) {
                    return (0, _ramdaSrcAssocPath2['default'])([k], {}, acc);
                }, {}, (0, _ramdaSrcKeys2['default'])(gd));
            }

            return (0, _ramdaSrcReduce2['default'])(function (acc, gdPath) {
                var _this2 = this;

                // a list of queues that the data went to
                var gdLinks = (0, _ramdaSrcDefaultTo2['default'])([], (0, _ramdaSrcPath2['default'])((0, _ramdaSrcConcat2['default'])(gdPath, ['destinations']), graphData));

                var lastMessage = (0, _ramdaSrcPath2['default'])((0, _ramdaSrcConcat2['default'])(gdPath, ['message']), graphData);

                // the { target: table.field } pattern from db-diayaml
                var newLinks = (0, _ramdaSrcMap2['default'])(function (item) {
                    var r = { diaprops: {
                            id: _this2._refer((0, _ramdaSrcConcat2['default'])(gdPath, [item]), lastMessage)
                        } };
                    if (lastMessage.initId === _this2._active[1]) {
                        r.diaprops.color = 'red';
                        r.diaprops.style = 'dashed';
                    }
                    r.target = item + '._';
                    return r;
                }, gdLinks);

                // put it into the links
                return (0, _ramdaSrcAssocPath2['default'])((0, _ramdaSrcConcat2['default'])(gdPath, ['links']), newLinks, acc);
            }, buildBase(graphData), paths);
        }
    }]);

    return Visualize;
})(_events.EventEmitter);

exports['default'] = Visualize;
module.exports = exports['default'];

