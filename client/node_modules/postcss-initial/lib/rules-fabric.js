var decls =  require('./decls.json');

function template(string, data) {
  return string.replace(/\$\{([\w\-\.]*)\}/g, function (_str, key) {
    var v = data[key];
    return typeof v !== 'undefined' && v !== null ? v : '';
  });
}

/*
  Rules legend:
   - combined - if rule is combined it will be rendered with template
   - combined and basic rules are present in basic reset
   - combined, basic and inherited rules are present in full reset
*/

function _getRulesMap(inputDecls) {
  return inputDecls
    .filter(function (decl) {
      return !decl.combined;
    })
    .reduce(function (map, decl) {
      map[decl.prop.replace(/\-/g, '')] = decl.initial;
      return map;
    }, {});
}

function _compileDecls(inputDecls) {
  var templateVars = _getRulesMap(inputDecls);
  return inputDecls.map(function (decl) {
    if (decl.combined && decl.initial) {
      decl.initial = template(decl.initial.replace(/\-/g, ''), templateVars);
    }
    return decl;
  });
}

function _getRequirements(inputDecls) {
  return inputDecls.reduce(function (map, decl) {
    if (!decl.contains) return map;
    return decl.contains.reduce(function (mapInner, dependency) {
      mapInner[dependency] = decl;
      return mapInner;
    }, map);
  }, {});
}

function _expandContainments(inputDecls) {
  var requiredMap = _getRequirements(inputDecls);
  return inputDecls
    .filter(function (decl) {
      return !decl.contains;
    }).map(function (decl) {
      var dependency = requiredMap[decl.prop];
      if (dependency) {
        decl.requiredBy = dependency.prop;
        decl.basic = decl.basic || dependency.basic;
        decl.inherited = decl.inherited || dependency.inherited;
      }
      return decl;
    });
}

var compiledDecls = _expandContainments(_compileDecls(decls));

function _clearDecls(rules, value) {
  return rules.map(function (rule) {
    return {
      prop:  rule.prop,
      value: value.replace(/\binitial\b/g, rule.initial)
    };
  });
}

function _allDecls(onlyInherited) {
  return compiledDecls.filter(function (decl) {
    var allowed = decl.combined || decl.basic;
    if (onlyInherited) return allowed && decl.inherited;
    return allowed;
  });
}

function _concreteDecl(declName) {
  return compiledDecls.filter(function (decl) {
    return declName === decl.prop || declName === decl.requiredBy;
  });
}

function makeFallbackFunction(onlyInherited) {
  return function (declName, declValue) {
    var result;
    if (declName === 'all') {
      result = _allDecls(onlyInherited);
    } else {
      result = _concreteDecl(declName);
    }
    return _clearDecls(result, declValue);
  };
}

module.exports = makeFallbackFunction;
