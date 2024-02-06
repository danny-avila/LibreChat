import { NativeDragSource } from './NativeDragSource.js';
import { nativeTypesConfig } from './nativeTypesConfig.js';
export function createNativeDragSource(type, dataTransfer) {
    const config = nativeTypesConfig[type];
    if (!config) {
        throw new Error(`native type ${type} has no configuration`);
    }
    const result = new NativeDragSource(config);
    result.loadDataTransfer(dataTransfer);
    return result;
}
export function matchNativeItemType(dataTransfer) {
    if (!dataTransfer) {
        return null;
    }
    const dataTransferTypes = Array.prototype.slice.call(dataTransfer.types || []);
    return Object.keys(nativeTypesConfig).filter((nativeItemType)=>{
        const typeConfig = nativeTypesConfig[nativeItemType];
        if (!(typeConfig === null || typeConfig === void 0 ? void 0 : typeConfig.matchesTypes)) {
            return false;
        }
        return typeConfig.matchesTypes.some((t)=>dataTransferTypes.indexOf(t) > -1
        );
    })[0] || null;
}

//# sourceMappingURL=index.js.map