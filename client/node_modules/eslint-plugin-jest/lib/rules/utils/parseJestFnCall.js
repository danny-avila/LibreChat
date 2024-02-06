"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getNodeChain = getNodeChain;
exports.resolveScope = exports.parseJestFnCallWithReason = exports.parseJestFnCall = exports.isTypeOfJestFnCall = void 0;
var _utils = require("@typescript-eslint/utils");
var _utils2 = require("../utils");
const isTypeOfJestFnCall = (node, context, types) => {
  const jestFnCall = parseJestFnCall(node, context);
  return jestFnCall !== null && types.includes(jestFnCall.type);
};
exports.isTypeOfJestFnCall = isTypeOfJestFnCall;
const joinChains = (a, b) => a && b ? [...a, ...b] : null;
function getNodeChain(node) {
  if ((0, _utils2.isSupportedAccessor)(node)) {
    return [node];
  }
  switch (node.type) {
    case _utils.AST_NODE_TYPES.TaggedTemplateExpression:
      return getNodeChain(node.tag);
    case _utils.AST_NODE_TYPES.MemberExpression:
      return joinChains(getNodeChain(node.object), getNodeChain(node.property));
    case _utils.AST_NODE_TYPES.CallExpression:
      return getNodeChain(node.callee);
  }
  return null;
}
const determineJestFnType = name => {
  if (name === 'expect') {
    return 'expect';
  }
  if (name === 'jest') {
    return 'jest';
  }
  if (_utils2.DescribeAlias.hasOwnProperty(name)) {
    return 'describe';
  }
  if (_utils2.TestCaseName.hasOwnProperty(name)) {
    return 'test';
  }

  /* istanbul ignore else */
  if (_utils2.HookName.hasOwnProperty(name)) {
    return 'hook';
  }

  /* istanbul ignore next */
  return 'unknown';
};
const ValidJestFnCallChains = ['afterAll', 'afterEach', 'beforeAll', 'beforeEach', 'describe', 'describe.each', 'describe.only', 'describe.only.each', 'describe.skip', 'describe.skip.each', 'fdescribe', 'fdescribe.each', 'xdescribe', 'xdescribe.each', 'it', 'it.concurrent', 'it.concurrent.each', 'it.concurrent.only.each', 'it.concurrent.skip.each', 'it.each', 'it.failing', 'it.only', 'it.only.each', 'it.only.failing', 'it.skip', 'it.skip.each', 'it.skip.failing', 'it.todo', 'fit', 'fit.each', 'fit.failing', 'xit', 'xit.each', 'xit.failing', 'test', 'test.concurrent', 'test.concurrent.each', 'test.concurrent.only.each', 'test.concurrent.skip.each', 'test.each', 'test.failing', 'test.only', 'test.only.each', 'test.only.failing', 'test.skip', 'test.skip.each', 'test.skip.failing', 'test.todo', 'xtest', 'xtest.each', 'xtest.failing'];
const resolvePossibleAliasedGlobal = (global, context) => {
  var _context$settings$jes;
  const globalAliases = ((_context$settings$jes = context.settings.jest) === null || _context$settings$jes === void 0 ? void 0 : _context$settings$jes.globalAliases) ?? {};
  const alias = Object.entries(globalAliases).find(([, aliases]) => aliases.includes(global));
  if (alias) {
    return alias[0];
  }
  return null;
};
const parseJestFnCallCache = new WeakMap();
const parseJestFnCall = (node, context) => {
  const jestFnCall = parseJestFnCallWithReason(node, context);
  if (typeof jestFnCall === 'string') {
    return null;
  }
  return jestFnCall;
};
exports.parseJestFnCall = parseJestFnCall;
const parseJestFnCallWithReason = (node, context) => {
  let parsedJestFnCall = parseJestFnCallCache.get(node);
  if (parsedJestFnCall) {
    return parsedJestFnCall;
  }
  parsedJestFnCall = parseJestFnCallWithReasonInner(node, context);
  parseJestFnCallCache.set(node, parsedJestFnCall);
  return parsedJestFnCall;
};
exports.parseJestFnCallWithReason = parseJestFnCallWithReason;
const parseJestFnCallWithReasonInner = (node, context) => {
  var _node$parent2, _node$parent3;
  const chain = getNodeChain(node);
  if (!(chain !== null && chain !== void 0 && chain.length)) {
    return null;
  }
  const [first, ...rest] = chain;
  const lastLink = (0, _utils2.getAccessorValue)(chain[chain.length - 1]);

  // if we're an `each()`, ensure we're the outer CallExpression (i.e `.each()()`)
  if (lastLink === 'each') {
    if (node.callee.type !== _utils.AST_NODE_TYPES.CallExpression && node.callee.type !== _utils.AST_NODE_TYPES.TaggedTemplateExpression) {
      return null;
    }
  }
  if (node.callee.type === _utils.AST_NODE_TYPES.TaggedTemplateExpression && lastLink !== 'each') {
    return null;
  }
  const resolved = resolveToJestFn(context, first);

  // we're not a jest function
  if (!resolved) {
    return null;
  }
  const name = resolved.original ?? resolved.local;
  const links = [name, ...rest.map(link => (0, _utils2.getAccessorValue)(link))];
  if (name !== 'jest' && name !== 'expect' && !ValidJestFnCallChains.includes(links.join('.'))) {
    return null;
  }
  const parsedJestFnCall = {
    name,
    head: {
      ...resolved,
      node: first
    },
    // every member node must have a member expression as their parent
    // in order to be part of the call chain we're parsing
    members: rest
  };
  const type = determineJestFnType(name);
  if (type === 'expect') {
    const result = parseJestExpectCall(parsedJestFnCall);

    // if the `expect` call chain is not valid, only report on the topmost node
    // since all members in the chain are likely to get flagged for some reason
    if (typeof result === 'string' && (0, _utils2.findTopMostCallExpression)(node) !== node) {
      return null;
    }
    if (result === 'matcher-not-found') {
      var _node$parent;
      if (((_node$parent = node.parent) === null || _node$parent === void 0 ? void 0 : _node$parent.type) === _utils.AST_NODE_TYPES.MemberExpression) {
        return 'matcher-not-called';
      }
    }
    return result;
  }

  // check that every link in the chain except the last is a member expression
  if (chain.slice(0, chain.length - 1).some(nod => {
    var _nod$parent;
    return ((_nod$parent = nod.parent) === null || _nod$parent === void 0 ? void 0 : _nod$parent.type) !== _utils.AST_NODE_TYPES.MemberExpression;
  })) {
    return null;
  }

  // ensure that we're at the "top" of the function call chain otherwise when
  // parsing e.g. x().y.z(), we'll incorrectly find & parse "x()" even though
  // the full chain is not a valid jest function call chain
  if (((_node$parent2 = node.parent) === null || _node$parent2 === void 0 ? void 0 : _node$parent2.type) === _utils.AST_NODE_TYPES.CallExpression || ((_node$parent3 = node.parent) === null || _node$parent3 === void 0 ? void 0 : _node$parent3.type) === _utils.AST_NODE_TYPES.MemberExpression) {
    return null;
  }
  return {
    ...parsedJestFnCall,
    type
  };
};
const findModifiersAndMatcher = members => {
  const modifiers = [];
  for (const member of members) {
    var _member$parent, _member$parent$parent;
    // check if the member is being called, which means it is the matcher
    // (and also the end of the entire "expect" call chain)
    if (((_member$parent = member.parent) === null || _member$parent === void 0 ? void 0 : _member$parent.type) === _utils.AST_NODE_TYPES.MemberExpression && ((_member$parent$parent = member.parent.parent) === null || _member$parent$parent === void 0 ? void 0 : _member$parent$parent.type) === _utils.AST_NODE_TYPES.CallExpression) {
      return {
        matcher: member,
        args: member.parent.parent.arguments,
        modifiers
      };
    }

    // otherwise, it should be a modifier
    const name = (0, _utils2.getAccessorValue)(member);
    if (modifiers.length === 0) {
      // the first modifier can be any of the three modifiers
      if (!_utils2.ModifierName.hasOwnProperty(name)) {
        return 'modifier-unknown';
      }
    } else if (modifiers.length === 1) {
      // the second modifier can only be "not"
      if (name !== _utils2.ModifierName.not) {
        return 'modifier-unknown';
      }
      const firstModifier = (0, _utils2.getAccessorValue)(modifiers[0]);

      // and the first modifier has to be either "resolves" or "rejects"
      if (firstModifier !== _utils2.ModifierName.resolves && firstModifier !== _utils2.ModifierName.rejects) {
        return 'modifier-unknown';
      }
    } else {
      return 'modifier-unknown';
    }
    modifiers.push(member);
  }

  // this will only really happen if there are no members
  return 'matcher-not-found';
};
const parseJestExpectCall = typelessParsedJestFnCall => {
  const modifiersAndMatcher = findModifiersAndMatcher(typelessParsedJestFnCall.members);
  if (typeof modifiersAndMatcher === 'string') {
    return modifiersAndMatcher;
  }
  return {
    ...typelessParsedJestFnCall,
    type: 'expect',
    ...modifiersAndMatcher
  };
};
const describeImportDefAsImport = def => {
  if (def.parent.type === _utils.AST_NODE_TYPES.TSImportEqualsDeclaration) {
    return null;
  }
  if (def.node.type !== _utils.AST_NODE_TYPES.ImportSpecifier) {
    return null;
  }

  // we only care about value imports
  if (def.parent.importKind === 'type') {
    return null;
  }
  return {
    source: def.parent.source.value,
    imported: def.node.imported.name,
    local: def.node.local.name
  };
};

/**
 * Attempts to find the node that represents the import source for the
 * given expression node, if it looks like it's an import.
 *
 * If no such node can be found (e.g. because the expression doesn't look
 * like an import), then `null` is returned instead.
 */
const findImportSourceNode = node => {
  if (node.type === _utils.AST_NODE_TYPES.AwaitExpression) {
    if (node.argument.type === _utils.AST_NODE_TYPES.ImportExpression) {
      return node.argument.source;
    }
    return null;
  }
  if (node.type === _utils.AST_NODE_TYPES.CallExpression && (0, _utils2.isIdentifier)(node.callee, 'require')) {
    return node.arguments[0] ?? null;
  }
  return null;
};
const describeVariableDefAsImport = def => {
  var _def$name$parent;
  // make sure that we've actually being assigned a value
  if (!def.node.init) {
    return null;
  }
  const sourceNode = findImportSourceNode(def.node.init);
  if (!sourceNode || !(0, _utils2.isStringNode)(sourceNode)) {
    return null;
  }
  if (((_def$name$parent = def.name.parent) === null || _def$name$parent === void 0 ? void 0 : _def$name$parent.type) !== _utils.AST_NODE_TYPES.Property) {
    return null;
  }
  if (!(0, _utils2.isSupportedAccessor)(def.name.parent.key)) {
    return null;
  }
  return {
    source: (0, _utils2.getStringValue)(sourceNode),
    imported: (0, _utils2.getAccessorValue)(def.name.parent.key),
    local: def.name.name
  };
};

/**
 * Attempts to describe a definition as an import if possible.
 *
 * If the definition is an import binding, it's described as you'd expect.
 * If the definition is a variable, then we try and determine if it's either
 * a dynamic `import()` or otherwise a call to `require()`.
 *
 * If it's neither of these, `null` is returned to indicate that the definition
 * is not describable as an import of any kind.
 */
const describePossibleImportDef = def => {
  if (def.type === 'Variable') {
    return describeVariableDefAsImport(def);
  }
  if (def.type === 'ImportBinding') {
    return describeImportDefAsImport(def);
  }
  return null;
};
const resolveScope = (scope, identifier) => {
  let currentScope = scope;
  while (currentScope !== null) {
    const ref = currentScope.set.get(identifier);
    if (ref && ref.defs.length > 0) {
      const def = ref.defs[ref.defs.length - 1];
      const importDetails = describePossibleImportDef(def);
      if ((importDetails === null || importDetails === void 0 ? void 0 : importDetails.local) === identifier) {
        return importDetails;
      }
      return 'local';
    }
    currentScope = currentScope.upper;
  }
  return null;
};
exports.resolveScope = resolveScope;
const resolveToJestFn = (context, accessor) => {
  const identifier = (0, _utils2.getAccessorValue)(accessor);
  const maybeImport = resolveScope((0, _utils2.getScope)(context, accessor), identifier);

  // the identifier was found as a local variable or function declaration
  // meaning it's not a function from jest
  if (maybeImport === 'local') {
    return null;
  }
  if (maybeImport) {
    // the identifier is imported from @jest/globals,
    // so return the original import name
    if (maybeImport.source === '@jest/globals') {
      return {
        original: maybeImport.imported,
        local: maybeImport.local,
        type: 'import'
      };
    }
    return null;
  }
  return {
    original: resolvePossibleAliasedGlobal(identifier, context),
    local: identifier,
    type: 'global'
  };
};