"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;
var _core = require("@babel/core");
var _helperReplaceSupers = require("@babel/helper-replace-supers");
var _helperSplitExportDeclaration = require("@babel/helper-split-export-declaration");
var _helperSkipTransparentExpressionWrappers = require("@babel/helper-skip-transparent-expression-wrappers");
var _fields = require("./fields.js");
function incrementId(id, idx = id.length - 1) {
  if (idx === -1) {
    id.unshift(65);
    return;
  }
  const current = id[idx];
  if (current === 90) {
    id[idx] = 97;
  } else if (current === 122) {
    id[idx] = 65;
    incrementId(id, idx - 1);
  } else {
    id[idx] = current + 1;
  }
}
function createPrivateUidGeneratorForClass(classPath) {
  const currentPrivateId = [];
  const privateNames = new Set();
  classPath.traverse({
    PrivateName(path) {
      privateNames.add(path.node.id.name);
    }
  });
  return () => {
    let reifiedId;
    do {
      incrementId(currentPrivateId);
      reifiedId = String.fromCharCode(...currentPrivateId);
    } while (privateNames.has(reifiedId));
    return _core.types.privateName(_core.types.identifier(reifiedId));
  };
}
function createLazyPrivateUidGeneratorForClass(classPath) {
  let generator;
  return () => {
    if (!generator) {
      generator = createPrivateUidGeneratorForClass(classPath);
    }
    return generator();
  };
}
function replaceClassWithVar(path, className) {
  if (path.type === "ClassDeclaration") {
    const id = path.node.id;
    const className = id.name;
    const varId = path.scope.generateUidIdentifierBasedOnNode(id);
    const classId = _core.types.identifier(className);
    path.scope.rename(className, varId.name);
    path.get("id").replaceWith(classId);
    return {
      id: _core.types.cloneNode(varId),
      path
    };
  } else {
    let varId;
    if (path.node.id) {
      className = path.node.id.name;
      varId = path.scope.parent.generateDeclaredUidIdentifier(className);
      path.scope.rename(className, varId.name);
    } else {
      varId = path.scope.parent.generateDeclaredUidIdentifier(typeof className === "string" ? className : "decorated_class");
    }
    const newClassExpr = _core.types.classExpression(typeof className === "string" ? _core.types.identifier(className) : null, path.node.superClass, path.node.body);
    const [newPath] = path.replaceWith(_core.types.sequenceExpression([newClassExpr, varId]));
    return {
      id: _core.types.cloneNode(varId),
      path: newPath.get("expressions.0")
    };
  }
}
function generateClassProperty(key, value, isStatic) {
  if (key.type === "PrivateName") {
    return _core.types.classPrivateProperty(key, value, undefined, isStatic);
  } else {
    return _core.types.classProperty(key, value, undefined, undefined, isStatic);
  }
}
function addProxyAccessorsFor(className, element, originalKey, targetKey, version, isComputed = false) {
  const {
    static: isStatic
  } = element.node;
  const thisArg = version === "2023-05" && isStatic ? className : _core.types.thisExpression();
  const getterBody = _core.types.blockStatement([_core.types.returnStatement(_core.types.memberExpression(_core.types.cloneNode(thisArg), _core.types.cloneNode(targetKey)))]);
  const setterBody = _core.types.blockStatement([_core.types.expressionStatement(_core.types.assignmentExpression("=", _core.types.memberExpression(_core.types.cloneNode(thisArg), _core.types.cloneNode(targetKey)), _core.types.identifier("v")))]);
  let getter, setter;
  if (originalKey.type === "PrivateName") {
    getter = _core.types.classPrivateMethod("get", _core.types.cloneNode(originalKey), [], getterBody, isStatic);
    setter = _core.types.classPrivateMethod("set", _core.types.cloneNode(originalKey), [_core.types.identifier("v")], setterBody, isStatic);
  } else {
    getter = _core.types.classMethod("get", _core.types.cloneNode(originalKey), [], getterBody, isComputed, isStatic);
    setter = _core.types.classMethod("set", _core.types.cloneNode(originalKey), [_core.types.identifier("v")], setterBody, isComputed, isStatic);
  }
  element.insertAfter(setter);
  element.insertAfter(getter);
}
function extractProxyAccessorsFor(targetKey, version) {
  if (version !== "2023-05" && version !== "2023-01") {
    return [_core.template.expression.ast`
        function () {
          return this.${_core.types.cloneNode(targetKey)};
        }
      `, _core.template.expression.ast`
        function (value) {
          this.${_core.types.cloneNode(targetKey)} = value;
        }
      `];
  }
  return [_core.template.expression.ast`
      o => o.${_core.types.cloneNode(targetKey)}
    `, _core.template.expression.ast`
      (o, v) => o.${_core.types.cloneNode(targetKey)} = v
    `];
}
function prependExpressionsToFieldInitializer(expressions, fieldPath) {
  const initializer = fieldPath.get("value");
  if (initializer.node) {
    expressions.push(initializer.node);
  } else if (expressions.length > 0) {
    expressions[expressions.length - 1] = _core.types.unaryExpression("void", expressions[expressions.length - 1]);
  }
  initializer.replaceWith(maybeSequenceExpression(expressions));
}
function prependExpressionsToConstructor(expressions, constructorPath) {
  constructorPath.node.body.body.unshift(_core.types.expressionStatement(maybeSequenceExpression(expressions)));
}
function isProtoInitCallExpression(expression, protoInitCall) {
  return _core.types.isCallExpression(expression) && _core.types.isIdentifier(expression.callee, {
    name: protoInitCall.name
  });
}
function optimizeSuperCallAndExpressions(expressions, protoInitLocal) {
  if (expressions.length >= 2 && isProtoInitCallExpression(expressions[1], protoInitLocal)) {
    const mergedSuperCall = _core.types.callExpression(_core.types.cloneNode(protoInitLocal), [expressions[0]]);
    expressions.splice(0, 2, mergedSuperCall);
  }
  if (expressions.length >= 2 && _core.types.isThisExpression(expressions[expressions.length - 1]) && isProtoInitCallExpression(expressions[expressions.length - 2], protoInitLocal)) {
    expressions.splice(expressions.length - 1, 1);
  }
  return maybeSequenceExpression(expressions);
}
function insertExpressionsAfterSuperCallAndOptimize(expressions, constructorPath, protoInitLocal) {
  constructorPath.traverse({
    CallExpression: {
      exit(path) {
        if (!path.get("callee").isSuper()) return;
        const newNodes = [path.node, ...expressions.map(expr => _core.types.cloneNode(expr))];
        if (path.isCompletionRecord()) {
          newNodes.push(_core.types.thisExpression());
        }
        path.replaceWith(optimizeSuperCallAndExpressions(newNodes, protoInitLocal));
        path.skip();
      }
    },
    ClassMethod(path) {
      if (path.node.kind === "constructor") {
        path.skip();
      }
    }
  });
}
function createConstructorFromExpressions(expressions, isDerivedClass) {
  const body = [_core.types.expressionStatement(maybeSequenceExpression(expressions))];
  if (isDerivedClass) {
    body.unshift(_core.types.expressionStatement(_core.types.callExpression(_core.types.super(), [_core.types.spreadElement(_core.types.identifier("args"))])));
  }
  return _core.types.classMethod("constructor", _core.types.identifier("constructor"), isDerivedClass ? [_core.types.restElement(_core.types.identifier("args"))] : [], _core.types.blockStatement(body));
}
const FIELD = 0;
const ACCESSOR = 1;
const METHOD = 2;
const GETTER = 3;
const SETTER = 4;
const STATIC_OLD_VERSION = 5;
const STATIC = 8;
const DECORATORS_HAVE_THIS = 16;
function getElementKind(element) {
  switch (element.node.type) {
    case "ClassProperty":
    case "ClassPrivateProperty":
      return FIELD;
    case "ClassAccessorProperty":
      return ACCESSOR;
    case "ClassMethod":
    case "ClassPrivateMethod":
      if (element.node.kind === "get") {
        return GETTER;
      } else if (element.node.kind === "set") {
        return SETTER;
      } else {
        return METHOD;
      }
  }
}
function isDecoratorInfo(info) {
  return "decorators" in info;
}
function filteredOrderedDecoratorInfo(info) {
  const filtered = info.filter(isDecoratorInfo);
  return [...filtered.filter(el => el.isStatic && el.kind >= ACCESSOR && el.kind <= SETTER), ...filtered.filter(el => !el.isStatic && el.kind >= ACCESSOR && el.kind <= SETTER), ...filtered.filter(el => el.isStatic && el.kind === FIELD), ...filtered.filter(el => !el.isStatic && el.kind === FIELD)];
}
function generateDecorationList(decorators, decoratorsThis, version) {
  const decsCount = decorators.length;
  const hasOneThis = decoratorsThis.some(Boolean);
  const decs = [];
  for (let i = 0; i < decsCount; i++) {
    if (version === "2023-05" && hasOneThis) {
      decs.push(decoratorsThis[i] || _core.types.unaryExpression("void", _core.types.numericLiteral(0)));
    }
    decs.push(decorators[i]);
  }
  return {
    hasThis: hasOneThis,
    decs
  };
}
function generateDecorationExprs(info, version) {
  return _core.types.arrayExpression(filteredOrderedDecoratorInfo(info).map(el => {
    const {
      decs,
      hasThis
    } = generateDecorationList(el.decorators, el.decoratorsThis, version);
    let flag = el.kind;
    if (el.isStatic) {
      flag += version === "2023-05" ? STATIC : STATIC_OLD_VERSION;
    }
    if (hasThis) flag += DECORATORS_HAVE_THIS;
    return _core.types.arrayExpression([decs.length === 1 ? decs[0] : _core.types.arrayExpression(decs), _core.types.numericLiteral(flag), el.name, ...(el.privateMethods || [])]);
  }));
}
function extractElementLocalAssignments(decorationInfo) {
  const localIds = [];
  for (const el of filteredOrderedDecoratorInfo(decorationInfo)) {
    const {
      locals
    } = el;
    if (Array.isArray(locals)) {
      localIds.push(...locals);
    } else if (locals !== undefined) {
      localIds.push(locals);
    }
  }
  return localIds;
}
function addCallAccessorsFor(element, key, getId, setId) {
  element.insertAfter(_core.types.classPrivateMethod("get", _core.types.cloneNode(key), [], _core.types.blockStatement([_core.types.returnStatement(_core.types.callExpression(_core.types.cloneNode(getId), [_core.types.thisExpression()]))])));
  element.insertAfter(_core.types.classPrivateMethod("set", _core.types.cloneNode(key), [_core.types.identifier("v")], _core.types.blockStatement([_core.types.expressionStatement(_core.types.callExpression(_core.types.cloneNode(setId), [_core.types.thisExpression(), _core.types.identifier("v")]))])));
}
function isNotTsParameter(node) {
  return node.type !== "TSParameterProperty";
}
function movePrivateAccessor(element, key, methodLocalVar, isStatic) {
  let params;
  let block;
  if (element.node.kind === "set") {
    params = [_core.types.identifier("v")];
    block = [_core.types.expressionStatement(_core.types.callExpression(methodLocalVar, [_core.types.thisExpression(), _core.types.identifier("v")]))];
  } else {
    params = [];
    block = [_core.types.returnStatement(_core.types.callExpression(methodLocalVar, [_core.types.thisExpression()]))];
  }
  element.replaceWith(_core.types.classPrivateMethod(element.node.kind, _core.types.cloneNode(key), params, _core.types.blockStatement(block), isStatic));
}
function isClassDecoratableElementPath(path) {
  const {
    type
  } = path;
  return type !== "TSDeclareMethod" && type !== "TSIndexSignature" && type !== "StaticBlock";
}
function staticBlockToIIFE(block) {
  return _core.types.callExpression(_core.types.arrowFunctionExpression([], _core.types.blockStatement(block.body)), []);
}
function maybeSequenceExpression(exprs) {
  if (exprs.length === 0) return _core.types.unaryExpression("void", _core.types.numericLiteral(0));
  if (exprs.length === 1) return exprs[0];
  return _core.types.sequenceExpression(exprs);
}
function createSetFunctionNameCall(state, className) {
  return _core.types.callExpression(state.addHelper("setFunctionName"), [_core.types.thisExpression(), className]);
}
function createToPropertyKeyCall(state, propertyKey) {
  return _core.types.callExpression(state.addHelper("toPropertyKey"), [propertyKey]);
}
function checkPrivateMethodUpdateError(path, decoratedPrivateMethods) {
  const privateNameVisitor = (0, _fields.privateNameVisitorFactory)({
    PrivateName(path, state) {
      if (!state.privateNamesMap.has(path.node.id.name)) return;
      const parentPath = path.parentPath;
      const parentParentPath = parentPath.parentPath;
      if (parentParentPath.node.type === "AssignmentExpression" && parentParentPath.node.left === parentPath.node || parentParentPath.node.type === "UpdateExpression" || parentParentPath.node.type === "RestElement" || parentParentPath.node.type === "ArrayPattern" || parentParentPath.node.type === "ObjectProperty" && parentParentPath.node.value === parentPath.node && parentParentPath.parentPath.type === "ObjectPattern" || parentParentPath.node.type === "ForOfStatement" && parentParentPath.node.left === parentPath.node) {
        throw path.buildCodeFrameError(`Decorated private methods are read-only, but "#${path.node.id.name}" is updated via this expression.`);
      }
    }
  });
  const privateNamesMap = new Map();
  for (const name of decoratedPrivateMethods) {
    privateNamesMap.set(name, null);
  }
  path.traverse(privateNameVisitor, {
    privateNamesMap: privateNamesMap
  });
}
function transformClass(path, state, constantSuper, version, className, propertyVisitor) {
  const body = path.get("body.body");
  const classDecorators = path.node.decorators;
  let hasElementDecorators = false;
  const generateClassPrivateUid = createLazyPrivateUidGeneratorForClass(path);
  const assignments = [];
  const scopeParent = path.scope.parent;
  const memoiseExpression = (expression, hint) => {
    const localEvaluatedId = scopeParent.generateDeclaredUidIdentifier(hint);
    assignments.push(_core.types.assignmentExpression("=", localEvaluatedId, expression));
    return _core.types.cloneNode(localEvaluatedId);
  };
  let protoInitLocal;
  let staticInitLocal;
  for (const element of body) {
    if (!isClassDecoratableElementPath(element)) {
      continue;
    }
    if (isDecorated(element.node)) {
      switch (element.node.type) {
        case "ClassProperty":
          propertyVisitor.ClassProperty(element, state);
          break;
        case "ClassPrivateProperty":
          propertyVisitor.ClassPrivateProperty(element, state);
          break;
        case "ClassAccessorProperty":
          propertyVisitor.ClassAccessorProperty(element, state);
        default:
          if (element.node.static) {
            var _staticInitLocal;
            (_staticInitLocal = staticInitLocal) != null ? _staticInitLocal : staticInitLocal = scopeParent.generateDeclaredUidIdentifier("initStatic");
          } else {
            var _protoInitLocal;
            (_protoInitLocal = protoInitLocal) != null ? _protoInitLocal : protoInitLocal = scopeParent.generateDeclaredUidIdentifier("initProto");
          }
          break;
      }
      hasElementDecorators = true;
    } else if (element.node.type === "ClassAccessorProperty") {
      propertyVisitor.ClassAccessorProperty(element, state);
      const {
        key,
        value,
        static: isStatic,
        computed
      } = element.node;
      const newId = generateClassPrivateUid();
      const newField = generateClassProperty(newId, value, isStatic);
      const keyPath = element.get("key");
      const [newPath] = element.replaceWith(newField);
      addProxyAccessorsFor(path.node.id, newPath, computed && !keyPath.isConstantExpression() ? memoiseExpression(createToPropertyKeyCall(state, key), "computedKey") : key, newId, version, computed);
    }
  }
  if (!classDecorators && !hasElementDecorators) {
    if (assignments.length > 0) {
      path.insertBefore(assignments.map(expr => _core.types.expressionStatement(expr)));
      path.scope.crawl();
    }
    return;
  }
  const elementDecoratorInfo = [];
  let constructorPath;
  const decoratedPrivateMethods = new Set();
  let classInitLocal, classIdLocal;
  const decoratorsThis = new Map();
  const maybeExtractDecorators = (decorators, memoiseInPlace) => {
    let needMemoise = false;
    for (const decorator of decorators) {
      const {
        expression
      } = decorator;
      if (version === "2023-05" && _core.types.isMemberExpression(expression)) {
        let object;
        if (_core.types.isSuper(expression.object) || _core.types.isThisExpression(expression.object)) {
          needMemoise = true;
          if (memoiseInPlace) {
            object = memoiseExpression(_core.types.thisExpression(), "obj");
          } else {
            object = _core.types.thisExpression();
          }
        } else {
          if (!scopeParent.isStatic(expression.object)) {
            needMemoise = true;
            if (memoiseInPlace) {
              expression.object = memoiseExpression(expression.object, "obj");
            }
          }
          object = _core.types.cloneNode(expression.object);
        }
        decoratorsThis.set(decorator, object);
      }
      if (!scopeParent.isStatic(expression)) {
        needMemoise = true;
        if (memoiseInPlace) {
          decorator.expression = memoiseExpression(expression, "dec");
        }
      }
    }
    return needMemoise && !memoiseInPlace;
  };
  let needsDeclaraionForClassBinding = false;
  let classDecorationsFlag = 0;
  let classDecorations = [];
  let classDecorationsId;
  if (classDecorators) {
    classInitLocal = scopeParent.generateDeclaredUidIdentifier("initClass");
    needsDeclaraionForClassBinding = path.isClassDeclaration();
    ({
      id: classIdLocal,
      path
    } = replaceClassWithVar(path, className));
    path.node.decorators = null;
    const needMemoise = maybeExtractDecorators(classDecorators, false);
    const {
      hasThis,
      decs
    } = generateDecorationList(classDecorators.map(el => el.expression), classDecorators.map(dec => decoratorsThis.get(dec)), version);
    classDecorationsFlag = hasThis ? 1 : 0;
    classDecorations = decs;
    if (needMemoise) {
      classDecorationsId = memoiseExpression(_core.types.arrayExpression(classDecorations), "classDecs");
    }
  } else {
    if (!path.node.id) {
      path.node.id = path.scope.generateUidIdentifier("Class");
    }
    classIdLocal = _core.types.cloneNode(path.node.id);
  }
  let lastInstancePrivateName;
  let needsInstancePrivateBrandCheck = false;
  let fieldInitializerAssignments = [];
  if (hasElementDecorators) {
    if (protoInitLocal) {
      const protoInitCall = _core.types.callExpression(_core.types.cloneNode(protoInitLocal), [_core.types.thisExpression()]);
      fieldInitializerAssignments.push(protoInitCall);
    }
    for (const element of body) {
      if (!isClassDecoratableElementPath(element)) {
        continue;
      }
      const {
        node
      } = element;
      const decorators = element.node.decorators;
      const hasDecorators = !!(decorators != null && decorators.length);
      if (hasDecorators) {
        maybeExtractDecorators(decorators, true);
      }
      const isComputed = "computed" in element.node && element.node.computed;
      if (isComputed) {
        if (!element.get("key").isConstantExpression()) {
          node.key = memoiseExpression(createToPropertyKeyCall(state, node.key), "computedKey");
        }
      }
      const kind = getElementKind(element);
      const {
        key
      } = node;
      const isPrivate = key.type === "PrivateName";
      const isStatic = element.node.static;
      let name = "computedKey";
      if (isPrivate) {
        name = key.id.name;
      } else if (!isComputed && key.type === "Identifier") {
        name = key.name;
      }
      if (isPrivate && !isStatic) {
        if (hasDecorators) {
          needsInstancePrivateBrandCheck = true;
        }
        if (_core.types.isClassPrivateProperty(node) || !lastInstancePrivateName) {
          lastInstancePrivateName = key;
        }
      }
      if (element.isClassMethod({
        kind: "constructor"
      })) {
        constructorPath = element;
      }
      if (hasDecorators) {
        let locals;
        let privateMethods;
        if (kind === ACCESSOR) {
          const {
            value
          } = element.node;
          const params = [_core.types.thisExpression()];
          if (value) {
            params.push(_core.types.cloneNode(value));
          }
          const newId = generateClassPrivateUid();
          const newFieldInitId = element.scope.parent.generateDeclaredUidIdentifier(`init_${name}`);
          const newValue = _core.types.callExpression(_core.types.cloneNode(newFieldInitId), params);
          const newField = generateClassProperty(newId, newValue, isStatic);
          const [newPath] = element.replaceWith(newField);
          if (isPrivate) {
            privateMethods = extractProxyAccessorsFor(newId, version);
            const getId = newPath.scope.parent.generateDeclaredUidIdentifier(`get_${name}`);
            const setId = newPath.scope.parent.generateDeclaredUidIdentifier(`set_${name}`);
            addCallAccessorsFor(newPath, key, getId, setId);
            locals = [newFieldInitId, getId, setId];
          } else {
            addProxyAccessorsFor(path.node.id, newPath, key, newId, version, isComputed);
            locals = newFieldInitId;
          }
        } else if (kind === FIELD) {
          const initId = element.scope.parent.generateDeclaredUidIdentifier(`init_${name}`);
          const valuePath = element.get("value");
          valuePath.replaceWith(_core.types.callExpression(_core.types.cloneNode(initId), [_core.types.thisExpression(), valuePath.node].filter(v => v)));
          locals = initId;
          if (isPrivate) {
            privateMethods = extractProxyAccessorsFor(key, version);
          }
        } else if (isPrivate) {
          locals = element.scope.parent.generateDeclaredUidIdentifier(`call_${name}`);
          const replaceSupers = new _helperReplaceSupers.default({
            constantSuper,
            methodPath: element,
            objectRef: classIdLocal,
            superRef: path.node.superClass,
            file: state.file,
            refToPreserve: classIdLocal
          });
          replaceSupers.replace();
          const {
            params,
            body,
            async: isAsync
          } = element.node;
          privateMethods = [_core.types.functionExpression(undefined, params.filter(isNotTsParameter), body, isAsync)];
          if (kind === GETTER || kind === SETTER) {
            movePrivateAccessor(element, _core.types.cloneNode(key), _core.types.cloneNode(locals), isStatic);
          } else {
            const node = element.node;
            path.node.body.body.unshift(_core.types.classPrivateProperty(key, _core.types.cloneNode(locals), [], node.static));
            decoratedPrivateMethods.add(key.id.name);
            element.remove();
          }
        }
        let nameExpr;
        if (isComputed) {
          nameExpr = _core.types.cloneNode(key);
        } else if (key.type === "PrivateName") {
          nameExpr = _core.types.stringLiteral(key.id.name);
        } else if (key.type === "Identifier") {
          nameExpr = _core.types.stringLiteral(key.name);
        } else {
          nameExpr = _core.types.cloneNode(key);
        }
        elementDecoratorInfo.push({
          kind,
          decorators: decorators.map(d => d.expression),
          decoratorsThis: decorators.map(d => decoratorsThis.get(d)),
          name: nameExpr,
          isStatic,
          privateMethods,
          locals
        });
        if (element.node) {
          element.node.decorators = null;
        }
      }
      if (fieldInitializerAssignments.length > 0 && !isStatic && (kind === FIELD || kind === ACCESSOR)) {
        prependExpressionsToFieldInitializer(fieldInitializerAssignments, element);
        fieldInitializerAssignments = [];
      }
    }
  }
  if (fieldInitializerAssignments.length > 0) {
    const isDerivedClass = !!path.node.superClass;
    if (constructorPath) {
      if (isDerivedClass) {
        insertExpressionsAfterSuperCallAndOptimize(fieldInitializerAssignments, constructorPath, protoInitLocal);
      } else {
        prependExpressionsToConstructor(fieldInitializerAssignments, constructorPath);
      }
    } else {
      path.node.body.body.unshift(createConstructorFromExpressions(fieldInitializerAssignments, isDerivedClass));
    }
    fieldInitializerAssignments = [];
  }
  const elementDecorations = generateDecorationExprs(elementDecoratorInfo, version);
  const elementLocals = extractElementLocalAssignments(elementDecoratorInfo);
  if (protoInitLocal) {
    elementLocals.push(protoInitLocal);
  }
  if (staticInitLocal) {
    elementLocals.push(staticInitLocal);
  }
  const classLocals = [];
  let classInitInjected = false;
  const classInitCall = classInitLocal && _core.types.callExpression(_core.types.cloneNode(classInitLocal), []);
  const originalClass = path.node;
  if (classDecorators) {
    classLocals.push(classIdLocal, classInitLocal);
    const statics = [];
    let staticBlocks = [];
    path.get("body.body").forEach(element => {
      if (element.isStaticBlock()) {
        staticBlocks.push(element.node);
        element.remove();
        return;
      }
      const isProperty = element.isClassProperty() || element.isClassPrivateProperty();
      if ((isProperty || element.isClassPrivateMethod()) && element.node.static) {
        if (isProperty && staticBlocks.length > 0) {
          const allValues = staticBlocks.map(staticBlockToIIFE);
          if (element.node.value) allValues.push(element.node.value);
          element.node.value = maybeSequenceExpression(allValues);
          staticBlocks = [];
        }
        element.node.static = false;
        statics.push(element.node);
        element.remove();
      }
    });
    if (statics.length > 0 || staticBlocks.length > 0) {
      const staticsClass = _core.template.expression.ast`
        class extends ${state.addHelper("identity")} {}
      `;
      staticsClass.body.body = [_core.types.staticBlock([_core.types.toStatement(originalClass, true) || _core.types.expressionStatement(originalClass)]), ...statics];
      const constructorBody = [];
      const newExpr = _core.types.newExpression(staticsClass, []);
      if (staticBlocks.length > 0) {
        constructorBody.push(...staticBlocks.map(staticBlockToIIFE));
      }
      if (classInitCall) {
        classInitInjected = true;
        constructorBody.push(classInitCall);
      }
      if (constructorBody.length > 0) {
        constructorBody.unshift(_core.types.callExpression(_core.types.super(), [_core.types.cloneNode(classIdLocal)]));
        staticsClass.body.body.push(_core.types.classMethod("constructor", _core.types.identifier("constructor"), [], _core.types.blockStatement([_core.types.expressionStatement(_core.types.sequenceExpression(constructorBody))])));
      } else {
        newExpr.arguments.push(_core.types.cloneNode(classIdLocal));
      }
      path.replaceWith(newExpr);
    }
  }
  if (!classInitInjected && classInitCall) {
    path.node.body.body.push(_core.types.staticBlock([_core.types.expressionStatement(classInitCall)]));
  }
  let {
    superClass
  } = originalClass;
  if (superClass && version === "2023-05") {
    const id = path.scope.maybeGenerateMemoised(superClass);
    if (id) {
      originalClass.superClass = _core.types.assignmentExpression("=", id, superClass);
      superClass = id;
    }
  }
  originalClass.body.body.unshift(_core.types.staticBlock([_core.types.expressionStatement(createLocalsAssignment(elementLocals, classLocals, elementDecorations, classDecorationsId ? _core.types.cloneNode(classDecorationsId) : _core.types.arrayExpression(classDecorations), _core.types.numericLiteral(classDecorationsFlag), needsInstancePrivateBrandCheck ? lastInstancePrivateName : null, typeof className === "object" ? className : undefined, _core.types.cloneNode(superClass), state, version)), staticInitLocal && _core.types.expressionStatement(_core.types.callExpression(_core.types.cloneNode(staticInitLocal), [_core.types.thisExpression()]))].filter(Boolean)));
  path.insertBefore(assignments.map(expr => _core.types.expressionStatement(expr)));
  if (needsDeclaraionForClassBinding) {
    path.insertBefore(_core.types.variableDeclaration("let", [_core.types.variableDeclarator(_core.types.cloneNode(classIdLocal))]));
  }
  if (decoratedPrivateMethods.size > 0) {
    checkPrivateMethodUpdateError(path, decoratedPrivateMethods);
  }
  path.scope.crawl();
  return path;
}
function createLocalsAssignment(elementLocals, classLocals, elementDecorations, classDecorations, classDecorationsFlag, maybePrivateBranName, setClassName, superClass, state, version) {
  let lhs, rhs;
  const args = [setClassName ? createSetFunctionNameCall(state, setClassName) : _core.types.thisExpression(), elementDecorations, classDecorations];
  {
    if (version === "2021-12" || version === "2022-03" && !state.availableHelper("applyDecs2203R")) {
      const lhs = _core.types.arrayPattern([...elementLocals, ...classLocals]);
      const rhs = _core.types.callExpression(state.addHelper(version === "2021-12" ? "applyDecs" : "applyDecs2203"), args);
      return _core.types.assignmentExpression("=", lhs, rhs);
    }
  }
  if (version === "2023-05") {
    if (maybePrivateBranName || superClass || classDecorationsFlag.value !== 0) {
      args.push(classDecorationsFlag);
    }
    if (maybePrivateBranName) {
      args.push(_core.template.expression.ast`
            _ => ${_core.types.cloneNode(maybePrivateBranName)} in _
          `);
    } else if (superClass) {
      args.push(_core.types.unaryExpression("void", _core.types.numericLiteral(0)));
    }
    if (superClass) args.push(superClass);
    rhs = _core.types.callExpression(state.addHelper("applyDecs2305"), args);
  } else if (version === "2023-01") {
    if (maybePrivateBranName) {
      args.push(_core.template.expression.ast`
            _ => ${_core.types.cloneNode(maybePrivateBranName)} in _
          `);
    }
    rhs = _core.types.callExpression(state.addHelper("applyDecs2301"), args);
  } else {
    rhs = _core.types.callExpression(state.addHelper("applyDecs2203R"), args);
  }
  if (elementLocals.length > 0) {
    if (classLocals.length > 0) {
      lhs = _core.types.objectPattern([_core.types.objectProperty(_core.types.identifier("e"), _core.types.arrayPattern(elementLocals)), _core.types.objectProperty(_core.types.identifier("c"), _core.types.arrayPattern(classLocals))]);
    } else {
      lhs = _core.types.arrayPattern(elementLocals);
      rhs = _core.types.memberExpression(rhs, _core.types.identifier("e"), false, false);
    }
  } else {
    lhs = _core.types.arrayPattern(classLocals);
    rhs = _core.types.memberExpression(rhs, _core.types.identifier("c"), false, false);
  }
  return _core.types.assignmentExpression("=", lhs, rhs);
}
function isProtoKey(node) {
  return node.type === "Identifier" ? node.name === "__proto__" : node.value === "__proto__";
}
function isDecorated(node) {
  return node.decorators && node.decorators.length > 0;
}
function shouldTransformElement(node) {
  switch (node.type) {
    case "ClassAccessorProperty":
      return true;
    case "ClassMethod":
    case "ClassProperty":
    case "ClassPrivateMethod":
    case "ClassPrivateProperty":
      return isDecorated(node);
    default:
      return false;
  }
}
function shouldTransformClass(node) {
  return isDecorated(node) || node.body.body.some(shouldTransformElement);
}
function NamedEvaluationVisitoryFactory(isAnonymous, visitor) {
  function handleComputedProperty(propertyPath, key, state) {
    switch (key.type) {
      case "StringLiteral":
        return _core.types.stringLiteral(key.value);
      case "NumericLiteral":
      case "BigIntLiteral":
        {
          const keyValue = key.value + "";
          propertyPath.get("key").replaceWith(_core.types.stringLiteral(keyValue));
          return _core.types.stringLiteral(keyValue);
        }
      default:
        {
          const ref = propertyPath.scope.maybeGenerateMemoised(key);
          propertyPath.get("key").replaceWith(_core.types.assignmentExpression("=", ref, createToPropertyKeyCall(state, key)));
          return _core.types.cloneNode(ref);
        }
    }
  }
  return {
    VariableDeclarator(path, state) {
      const id = path.node.id;
      if (id.type === "Identifier") {
        const initializer = (0, _helperSkipTransparentExpressionWrappers.skipTransparentExprWrappers)(path.get("init"));
        if (isAnonymous(initializer)) {
          const name = id.name;
          visitor(initializer, state, name);
        }
      }
    },
    AssignmentExpression(path, state) {
      const id = path.node.left;
      if (id.type === "Identifier") {
        const initializer = (0, _helperSkipTransparentExpressionWrappers.skipTransparentExprWrappers)(path.get("right"));
        if (isAnonymous(initializer)) {
          switch (path.node.operator) {
            case "=":
            case "&&=":
            case "||=":
            case "??=":
              visitor(initializer, state, id.name);
          }
        }
      }
    },
    AssignmentPattern(path, state) {
      const id = path.node.left;
      if (id.type === "Identifier") {
        const initializer = (0, _helperSkipTransparentExpressionWrappers.skipTransparentExprWrappers)(path.get("right"));
        if (isAnonymous(initializer)) {
          const name = id.name;
          visitor(initializer, state, name);
        }
      }
    },
    ObjectExpression(path, state) {
      for (const propertyPath of path.get("properties")) {
        const {
          node
        } = propertyPath;
        if (node.type !== "ObjectProperty") continue;
        const id = node.key;
        const initializer = (0, _helperSkipTransparentExpressionWrappers.skipTransparentExprWrappers)(propertyPath.get("value"));
        if (isAnonymous(initializer)) {
          if (!node.computed) {
            if (!isProtoKey(id)) {
              if (id.type === "Identifier") {
                visitor(initializer, state, id.name);
              } else {
                const className = _core.types.stringLiteral(id.value + "");
                visitor(initializer, state, className);
              }
            }
          } else {
            const ref = handleComputedProperty(propertyPath, id, state);
            visitor(initializer, state, ref);
          }
        }
      }
    },
    ClassPrivateProperty(path, state) {
      const {
        node
      } = path;
      const initializer = (0, _helperSkipTransparentExpressionWrappers.skipTransparentExprWrappers)(path.get("value"));
      if (isAnonymous(initializer)) {
        const className = _core.types.stringLiteral("#" + node.key.id.name);
        visitor(initializer, state, className);
      }
    },
    ClassAccessorProperty(path, state) {
      const {
        node
      } = path;
      const id = node.key;
      const initializer = (0, _helperSkipTransparentExpressionWrappers.skipTransparentExprWrappers)(path.get("value"));
      if (isAnonymous(initializer)) {
        if (!node.computed) {
          if (id.type === "Identifier") {
            visitor(initializer, state, id.name);
          } else if (id.type === "PrivateName") {
            const className = _core.types.stringLiteral("#" + id.id.name);
            visitor(initializer, state, className);
          } else {
            const className = _core.types.stringLiteral(id.value + "");
            visitor(initializer, state, className);
          }
        } else {
          const ref = handleComputedProperty(path, id, state);
          visitor(initializer, state, ref);
        }
      }
    },
    ClassProperty(path, state) {
      const {
        node
      } = path;
      const id = node.key;
      const initializer = (0, _helperSkipTransparentExpressionWrappers.skipTransparentExprWrappers)(path.get("value"));
      if (isAnonymous(initializer)) {
        if (!node.computed) {
          if (id.type === "Identifier") {
            visitor(initializer, state, id.name);
          } else {
            const className = _core.types.stringLiteral(id.value + "");
            visitor(initializer, state, className);
          }
        } else {
          const ref = handleComputedProperty(path, id, state);
          visitor(initializer, state, ref);
        }
      }
    }
  };
}
function isDecoratedAnonymousClassExpression(path) {
  return path.isClassExpression({
    id: null
  }) && shouldTransformClass(path.node);
}
function _default({
  assertVersion,
  assumption
}, {
  loose
}, version, inherits) {
  var _assumption;
  {
    if (version === "2023-05" || version === "2023-01") {
      assertVersion("^7.21.0");
    } else if (version === "2021-12") {
      assertVersion("^7.16.0");
    } else {
      assertVersion("^7.19.0");
    }
  }
  const VISITED = new WeakSet();
  const constantSuper = (_assumption = assumption("constantSuper")) != null ? _assumption : loose;
  const namedEvaluationVisitor = NamedEvaluationVisitoryFactory(isDecoratedAnonymousClassExpression, visitClass);
  function visitClass(path, state, className) {
    var _className, _node$id;
    if (VISITED.has(path)) return;
    const {
      node
    } = path;
    (_className = className) != null ? _className : className = (_node$id = node.id) == null ? void 0 : _node$id.name;
    const newPath = transformClass(path, state, constantSuper, version, className, namedEvaluationVisitor);
    if (newPath) {
      VISITED.add(newPath);
      return;
    }
    VISITED.add(path);
  }
  return {
    name: "proposal-decorators",
    inherits: inherits,
    visitor: Object.assign({
      ExportDefaultDeclaration(path, state) {
        const {
          declaration
        } = path.node;
        if ((declaration == null ? void 0 : declaration.type) === "ClassDeclaration" && isDecorated(declaration)) {
          const isAnonymous = !declaration.id;
          const updatedVarDeclarationPath = (0, _helperSplitExportDeclaration.default)(path);
          if (isAnonymous) {
            visitClass(updatedVarDeclarationPath, state, _core.types.stringLiteral("default"));
          }
        }
      },
      ExportNamedDeclaration(path) {
        const {
          declaration
        } = path.node;
        if ((declaration == null ? void 0 : declaration.type) === "ClassDeclaration" && isDecorated(declaration)) {
          (0, _helperSplitExportDeclaration.default)(path);
        }
      },
      Class(path, state) {
        visitClass(path, state, undefined);
      }
    }, namedEvaluationVisitor)
  };
}

//# sourceMappingURL=decorators.js.map
