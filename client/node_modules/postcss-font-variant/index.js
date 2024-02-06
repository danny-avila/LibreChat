/**
 * font variant convertion map
 *
 * @type {Object}
 */
const fontVariantProperties = {
  "font-variant-ligatures": {
    "common-ligatures": "\"liga\", \"clig\"",
    "no-common-ligatures": "\"liga\", \"clig off\"",
    "discretionary-ligatures": "\"dlig\"",
    "no-discretionary-ligatures": "\"dlig\" off",
    "historical-ligatures": "\"hlig\"",
    "no-historical-ligatures": "\"hlig\" off",
    contextual: "\"calt\"",
    "no-contextual": "\"calt\" off"
  },

  "font-variant-position": {
    sub: "\"subs\"",
    "super": "\"sups\"",
    normal: "\"subs\" off, \"sups\" off"
  },

  "font-variant-caps": {
    "small-caps": "\"smcp\"",
    "all-small-caps": "\"smcp\", \"c2sc\"",
    "petite-caps": "\"pcap\"",
    "all-petite-caps": "\"pcap\", \"c2pc\"",
    unicase: "\"unic\"",
    "titling-caps": "\"titl\""
  },

  "font-variant-numeric": {
    "lining-nums": "\"lnum\"",
    "oldstyle-nums": "\"onum\"",
    "proportional-nums": "\"pnum\"",
    "tabular-nums": "\"tnum\"",
    "diagonal-fractions": "\"frac\"",
    "stacked-fractions": "\"afrc\"",
    ordinal: "\"ordn\"",
    "slashed-zero": "\"zero\""
  },

  "font-kerning": {
    normal: "\"kern\"",
    none: "\"kern\" off"
  },

  "font-variant": {
    normal: "normal",
    inherit: "inherit"
  }
}

// The `font-variant` property is a shorthand for all the others.
for (const prop in fontVariantProperties) {
  const keys = fontVariantProperties[prop]
  for (const key in keys) {
    if (!(key in fontVariantProperties["font-variant"])) {
      fontVariantProperties["font-variant"][key] = keys[key]
    }
  }
}

// Find font-feature-settings declaration before given declaration,
// create if does not exist
function getFontFeatureSettingsPrevTo(decl) {
  let fontFeatureSettings = null;
  decl.parent.walkDecls((decl) => {
    if (decl.prop === "font-feature-settings") {
      fontFeatureSettings = decl;
    }
  })

  if (fontFeatureSettings === null) {
    fontFeatureSettings = decl.clone()
    fontFeatureSettings.prop = "font-feature-settings"
    fontFeatureSettings.value = ""
    decl.parent.insertBefore(decl, fontFeatureSettings)
  }
  return fontFeatureSettings
}

function walkRule(rule) {
  let fontFeatureSettings = null
  // read custom media queries
  rule.walkDecls((decl) => {
    if (!fontVariantProperties[decl.prop]) {
      return null
    }

    let newValue = decl.value
    if (decl.prop === "font-variant") {
      newValue = decl.value.split(/\s+/g).map((val) => {
        return fontVariantProperties["font-variant"][val]
      }).join(", ")
    }
    else if (fontVariantProperties[decl.prop][decl.value]) {
      newValue = fontVariantProperties[decl.prop][decl.value]
    }

    if (fontFeatureSettings === null) {
      fontFeatureSettings = getFontFeatureSettingsPrevTo(decl);
    }
    if (fontFeatureSettings.value && fontFeatureSettings.value !== newValue) {
      fontFeatureSettings.value += ", " + newValue;
    }
    else {
      fontFeatureSettings.value = newValue;
    }
  })
}

/**
 * Expose the font-variant plugin.
 */
module.exports = () => {
  return {
    postcssPlugin: "postcss-font-variant",
    Once(root) {
      root.walkRules(walkRule)
    }
  }
}

module.exports.postcss = true
