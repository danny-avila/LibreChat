import { assert, isArray, normalizeFileName } from './utils.js';
import { downloadFile } from './processors.js';
import { _prepareData, _createJSONData, createCSVData, createXLSData, createXMLData, _createFieldsMapper } from './converters.js';
import { exportTypes } from './types.js';
function exportFromJSON({ data, fileName = 'download', extension, fileNameFormatter = name => name.replace(/\s+/, '_'), fields, exportType = 'txt', replacer = null, space = 4, processor = downloadFile, withBOM = false, beforeTableEncode = (i) => i, delimiter = ',', }) {
    const MESSAGE_IS_ARRAY_FAIL = 'Invalid export data. Please provide an array of objects';
    const MESSAGE_UNKNOWN_EXPORT_TYPE = `Can't export unknown data type ${exportType}.`;
    const MESSAGE_FIELD_INVALID = `Can't export string data to ${exportType}.`;
    if (typeof data === 'string') {
        switch (exportType) {
            case 'txt':
            case 'css':
            case 'html': {
                return processor(data, exportType, normalizeFileName(fileName, extension !== null && extension !== void 0 ? extension : exportType, fileNameFormatter));
            }
            default:
                throw new Error(MESSAGE_FIELD_INVALID);
        }
    }
    const fieldsMapper = _createFieldsMapper(fields);
    const safeData = fieldsMapper(_prepareData(data));
    const JSONData = _createJSONData(safeData, replacer, space);
    switch (exportType) {
        case 'txt':
        case 'css':
        case 'html': {
            return processor(JSONData, exportType, normalizeFileName(fileName, extension !== null && extension !== void 0 ? extension : exportType, fileNameFormatter));
        }
        case 'json': {
            return processor(JSONData, exportType, normalizeFileName(fileName, extension !== null && extension !== void 0 ? extension : 'json', fileNameFormatter));
        }
        case 'csv': {
            assert(isArray(safeData), MESSAGE_IS_ARRAY_FAIL);
            const BOM = '\ufeff';
            const CSVData = createCSVData(safeData, { beforeTableEncode, delimiter });
            const content = withBOM ? BOM + CSVData : CSVData;
            return processor(content, exportType, normalizeFileName(fileName, extension !== null && extension !== void 0 ? extension : 'csv', fileNameFormatter));
        }
        case 'xls': {
            assert(isArray(safeData), MESSAGE_IS_ARRAY_FAIL);
            const content = createXLSData(safeData, { beforeTableEncode });
            return processor(content, exportType, normalizeFileName(fileName, extension !== null && extension !== void 0 ? extension : 'xls', fileNameFormatter));
        }
        case 'xml': {
            const content = createXMLData(safeData);
            return processor(content, exportType, normalizeFileName(fileName, extension !== null && extension !== void 0 ? extension : 'xml', fileNameFormatter));
        }
        default:
            throw new Error(MESSAGE_UNKNOWN_EXPORT_TYPE);
    }
}
exportFromJSON.types = exportTypes;
exportFromJSON.processors = { downloadFile };
export default exportFromJSON;
