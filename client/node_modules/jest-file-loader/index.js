const path = require('path');
const slash = require('slash');

function createTransformer(transformOptions) {
    const esModule = 
        typeof transformOptions !== 'undefined' && typeof transformOptions.esModule !== 'undefined'
        ? transformOptions.esModule
        : false;

    return {
        process(src, filename, options) {
            const rootDir = options.rootDir || options.config.rootDir;
            const exportedPath = JSON.stringify(slash(path.relative(rootDir, filename)));
    
            return {
                code: `${esModule ? 'export default' : 'module.exports ='} ${exportedPath};`
            };
        }
    }
}

module.exports = {
    ...createTransformer(),
    createTransformer,
};
