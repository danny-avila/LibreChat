const doNothingValues = new Set([
	'inherit',
	'initial',
	'revert',
	'unset',
]);

/**
 * @type {import('postcss').PluginCreator}
 */
module.exports = ({preserve = false} = {}) => ({
	postcssPlugin: 'postcss-opacity-percentage',
	Declaration: {
		opacity(decl) {
			if (!decl.value || decl.value.startsWith('var(') || !decl.value.endsWith('%') || doNothingValues.has(decl.value)) {
				return;
			}

			decl.cloneBefore({value: String(Number.parseFloat(decl.value) / 100)});
			if (!preserve) {
				decl.remove();
			}
		},
	},
});

module.exports.postcss = true;
