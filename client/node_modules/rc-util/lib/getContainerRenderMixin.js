"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getContainerRenderMixin;
var _objectSpread2 = _interopRequireDefault(require("@babel/runtime/helpers/objectSpread2"));
var _reactDom = _interopRequireDefault(require("react-dom"));
function defaultGetContainer() {
  var container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}
function getContainerRenderMixin(config) {
  var _config$autoMount = config.autoMount,
    autoMount = _config$autoMount === void 0 ? true : _config$autoMount,
    _config$autoDestroy = config.autoDestroy,
    autoDestroy = _config$autoDestroy === void 0 ? true : _config$autoDestroy,
    isVisible = config.isVisible,
    isForceRender = config.isForceRender,
    getComponent = config.getComponent,
    _config$getContainer = config.getContainer,
    getContainer = _config$getContainer === void 0 ? defaultGetContainer : _config$getContainer;
  var mixin;
  function _renderComponent(instance, componentArg, ready) {
    if (!isVisible || instance._component || isVisible(instance) || isForceRender && isForceRender(instance)) {
      if (!instance._container) {
        instance._container = getContainer(instance);
      }
      var component;
      if (instance.getComponent) {
        component = instance.getComponent(componentArg);
      } else {
        component = getComponent(instance, componentArg);
      }
      _reactDom.default.unstable_renderSubtreeIntoContainer(instance, component, instance._container, function callback() {
        instance._component = this;
        if (ready) {
          ready.call(this);
        }
      });
    }
  }
  if (autoMount) {
    mixin = (0, _objectSpread2.default)((0, _objectSpread2.default)({}, mixin), {}, {
      componentDidMount: function componentDidMount() {
        _renderComponent(this);
      },
      componentDidUpdate: function componentDidUpdate() {
        _renderComponent(this);
      }
    });
  }
  if (!autoMount || !autoDestroy) {
    mixin = (0, _objectSpread2.default)((0, _objectSpread2.default)({}, mixin), {}, {
      renderComponent: function renderComponent(componentArg, ready) {
        _renderComponent(this, componentArg, ready);
      }
    });
  }
  function _removeContainer(instance) {
    if (instance._container) {
      var container = instance._container;
      _reactDom.default.unmountComponentAtNode(container);
      container.parentNode.removeChild(container);
      instance._container = null;
    }
  }
  if (autoDestroy) {
    mixin = (0, _objectSpread2.default)((0, _objectSpread2.default)({}, mixin), {}, {
      componentWillUnmount: function componentWillUnmount() {
        _removeContainer(this);
      }
    });
  } else {
    mixin = (0, _objectSpread2.default)((0, _objectSpread2.default)({}, mixin), {}, {
      removeContainer: function removeContainer() {
        _removeContainer(this);
      }
    });
  }
  return mixin;
}