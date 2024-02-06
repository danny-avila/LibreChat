import { __makeTemplateObject } from 'tslib';
import { smart } from '@babel/template';

/**
 * Rewrites known `import.meta`[1] properties into equivalent non-module node.js
 * expressions. In order to maintain compatibility with plugins transforming
 * non-standard properties, this plugin transforms only known properties and
 * does not touch expressions with unknown or without member property access.
 * Properties known to this plugin:
 *
 * - `url`[2]
 *
 * [1]: https://github.com/tc39/proposal-import-meta
 * [2]: https://html.spec.whatwg.org/#hostgetimportmetaproperties
 */
function index () {
    return {
        name: 'transform-import-meta',
        visitor: {
            Program: function (path, state) {
                var _a;
                var _b = ((_a = state.opts) !== null && _a !== void 0 ? _a : {}).module, target = _b === void 0 ? 'CommonJS' : _b;
                if (target !== 'CommonJS' && target !== 'ES6') {
                    throw new Error('Invalid target, must be one of: "CommonJS" or "ES6"');
                }
                var metas = [];
                var identifiers = new Set();
                path.traverse({
                    MemberExpression: function (memberExpPath) {
                        var node = memberExpPath.node;
                        if (node.object.type === 'MetaProperty' &&
                            node.object.meta.name === 'import' &&
                            node.object.property.name === 'meta' &&
                            node.property.type === 'Identifier' &&
                            node.property.name === 'url') {
                            metas.push(memberExpPath);
                            for (var _i = 0, _a = Object.keys(memberExpPath.scope.getAllBindings()); _i < _a.length; _i++) {
                                var name = _a[_i];
                                identifiers.add(name);
                            }
                        }
                    }
                });
                if (metas.length === 0) {
                    return;
                }
                var metaUrlReplacement;
                switch (target) {
                    case 'CommonJS': {
                        metaUrlReplacement = smart.ast(templateObject_1 || (templateObject_1 = __makeTemplateObject(["require('url').pathToFileURL(__filename).toString()"], ["require('url').pathToFileURL(__filename).toString()"])));
                        break;
                    }
                    case 'ES6': {
                        var urlId = 'url';
                        while (identifiers.has(urlId)) {
                            urlId = path.scope.generateUidIdentifier('url').name;
                        }
                        path.node.body.unshift(smart.ast(templateObject_2 || (templateObject_2 = __makeTemplateObject(["import ", " from 'url';"], ["import ", " from 'url';"])), urlId));
                        metaUrlReplacement = smart.ast(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", ".pathToFileURL(__filename).toString()"], ["", ".pathToFileURL(__filename).toString()"])), urlId);
                        break;
                    }
                }
                for (var _i = 0, metas_1 = metas; _i < metas_1.length; _i++) {
                    var meta = metas_1[_i];
                    meta.replaceWith(metaUrlReplacement);
                }
            }
        }
    };
}
var templateObject_1, templateObject_2, templateObject_3;

export { index as default };
