module.exports = function(options) {
    return {
        postcssPlugin: 'postcss-page-break',
        Declaration(decl) {
            if (decl.prop.startsWith('break-') && /^break-(inside|before|after)/.test(decl.prop)) {
                // do not process column|region related properties
                if (decl.value.search(/column|region/) >= 0) {
                    return;
                }

                let newValue;
                switch (decl.value) {
                    case 'page':
                        newValue = 'always';
                        break;
                    case 'avoid-page':
                        newValue = 'avoid';
                        break;
                    default:
                        newValue = decl.value;
                }

                const newProperty = 'page-' + decl.prop;
                if (decl.parent.every((sibling) => sibling.prop !== newProperty)) {
                    decl.cloneBefore({
                        prop: newProperty,
                        value: newValue,
                    });
                }
            }
        },
    };

};
module.exports.postcss = true;
