const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');

const getFromModelCache = (id, name) => {
    const modelsCache = getLogStores(CacheKeys.MODEL_QUERIES);
    return cachedModels = modelsCache.get(id).then((cached) => {
        return cached ? cached[name] : undefined;
    });
}
const addToModelCache = (id, name, models) => {
    const modelsCache = getLogStores(CacheKeys.MODEL_QUERIES);
    return cachedModels = modelsCache.get(id).then((cached) => {
        const storable = cached || {};
        storable[name] = models;
        return modelsCache.set(id, storable).then(() => models);
    });
}
const removeFromModelCache = (id, name) => {
    const modelsCache = getLogStores(CacheKeys.MODEL_QUERIES);
    return modelsCache.get(id).then((cached) => {
        if (name === undefined) {
            // if name is not provided, remove the entire cache for the id
            return modelsCache.delete(id);
        }
        /** else remove only one key */
        if (!cached || !cached[name]) {
           return;
        }
        logger.debug(`${name}, removing model cache for user ${id}`);
        delete cached[name];
        if (Object.keys(cached).length === 0) {
            modelsCache.delete(id);
        } else {
            // update the cache with the modified object
            modelsCache.set(id, cached);
        }
    });
}
module.exports = { getFromModelCache, addToModelCache, removeFromModelCache }; 
