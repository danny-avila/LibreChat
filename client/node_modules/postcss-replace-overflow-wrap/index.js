// @ts-check

module.exports = function (opts) {
    opts = opts || {}
    var method = opts.method || 'replace'
    return {
        postcssPlugin: 'postcss-replace-overflow-wrap',
        Declaration: {
            'overflow-wrap': decl => {
                decl.cloneBefore({ prop: 'word-wrap' })
                if (method === 'replace') {
                    decl.remove()
                }
            }
        }
    }
}

module.exports.postcss = true
