"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));
var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));
var _assertThisInitialized2 = _interopRequireDefault(require("@babel/runtime/helpers/assertThisInitialized"));
var _inherits2 = _interopRequireDefault(require("@babel/runtime/helpers/inherits"));
var _createSuper2 = _interopRequireDefault(require("@babel/runtime/helpers/createSuper"));
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _react = _interopRequireDefault(require("react"));
var _reactDom = _interopRequireDefault(require("react-dom"));
/**
 * @deprecated Since we do not need support React15 any more.
 * Will remove in next major version.
 */
var ContainerRender = exports.default = /*#__PURE__*/function (_React$Component) {
  (0, _inherits2.default)(ContainerRender, _React$Component);
  var _super = (0, _createSuper2.default)(ContainerRender);
  function ContainerRender() {
    var _this;
    (0, _classCallCheck2.default)(this, ContainerRender);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _super.call.apply(_super, [this].concat(args));
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "removeContainer", function () {
      if (_this.container) {
        _reactDom.default.unmountComponentAtNode(_this.container);
        _this.container.parentNode.removeChild(_this.container);
        _this.container = null;
      }
    });
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "renderComponent", function (props, ready) {
      var _this$props = _this.props,
        visible = _this$props.visible,
        getComponent = _this$props.getComponent,
        forceRender = _this$props.forceRender,
        getContainer = _this$props.getContainer,
        parent = _this$props.parent;
      if (visible || parent._component || forceRender) {
        if (!_this.container) {
          _this.container = getContainer();
        }
        _reactDom.default.unstable_renderSubtreeIntoContainer(parent, getComponent(props), _this.container, function callback() {
          if (ready) {
            ready.call(this);
          }
        });
      }
    });
    return _this;
  }
  (0, _createClass2.default)(ContainerRender, [{
    key: "componentDidMount",
    value: function componentDidMount() {
      if (this.props.autoMount) {
        this.renderComponent();
      }
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate() {
      if (this.props.autoMount) {
        this.renderComponent();
      }
    }
  }, {
    key: "componentWillUnmount",
    value: function componentWillUnmount() {
      if (this.props.autoDestroy) {
        this.removeContainer();
      }
    }
  }, {
    key: "render",
    value: function render() {
      return this.props.children({
        renderComponent: this.renderComponent,
        removeContainer: this.removeContainer
      });
    }
  }]);
  return ContainerRender;
}(_react.default.Component);
(0, _defineProperty2.default)(ContainerRender, "defaultProps", {
  autoMount: true,
  autoDestroy: true,
  forceRender: false
});