import { assert, isArray, normalizeFileName } from './utils.js'
import { downloadFile } from './processors.js'
import { _prepareData, _createJSONData, createCSVData, createXLSData, createXMLData, _createFieldsMapper } from './converters.js'
import { exportTypes, ExportType } from './types.js'
export interface IOption<R = void> {
  data: object | string
  fileName?: string
  extension?: string
  fileNameFormatter?: (name: string) => string
  fields?: string[] | Record<string, string>
  exportType?: ExportType
  replacer?: ((key: string, value: any) => any) | Array<number | string> | null
  space?: string | number
  processor?: (content: string, type: ExportType, fileName: string) => R
  withBOM?: boolean
  beforeTableEncode?: (
    tableRow: Array<{ fieldName: string, fieldValues: string[] }>,
  ) => Array<{ fieldName: string, fieldValues: string[]}>
  delimiter?: ',' | ';'
}

function exportFromJSON<R = void> ({
  data,
  fileName = 'download',
  extension,
  fileNameFormatter = name => name.replace(/\s+/, '_'),
  fields,
  exportType = 'txt',
  replacer = null,
  space = 4,
  processor = downloadFile as never,
  withBOM = false,
  beforeTableEncode = (i) => i,
  delimiter = ',',
}: IOption<R>): R {
  const MESSAGE_IS_ARRAY_FAIL = 'Invalid export data. Please provide an array of objects'
  const MESSAGE_UNKNOWN_EXPORT_TYPE = `Can't export unknown data type ${exportType}.`
  const MESSAGE_FIELD_INVALID = `Can't export string data to ${exportType}.`

  if (typeof data === 'string') {
    switch (exportType) {
      case 'txt':
      case 'css':
      case 'html': {
          return processor(data, exportType, normalizeFileName(fileName, extension ?? exportType, fileNameFormatter))
        }
      default:
        throw new Error(MESSAGE_FIELD_INVALID)
    }
  }

  const fieldsMapper = _createFieldsMapper(fields)

  const safeData = fieldsMapper(_prepareData(data))

  const JSONData = _createJSONData(safeData, replacer, space)

  switch (exportType) {
    case 'txt':
    case 'css':
    case 'html': {
      return processor(JSONData, exportType, normalizeFileName(fileName, extension ?? exportType, fileNameFormatter))
    }
    case 'json': {
      return processor(JSONData, exportType, normalizeFileName(fileName, extension ?? 'json', fileNameFormatter))
    }
    case 'csv': {
      assert(isArray(safeData), MESSAGE_IS_ARRAY_FAIL)
      const BOM = '\ufeff'
      const CSVData = createCSVData(safeData, { beforeTableEncode, delimiter })
      const content = withBOM ? BOM + CSVData : CSVData

      return processor(content, exportType, normalizeFileName(fileName, extension ?? 'csv', fileNameFormatter))
    }
    case 'xls': {
      assert(isArray(safeData), MESSAGE_IS_ARRAY_FAIL)
      const content = createXLSData(safeData, { beforeTableEncode })

      return processor(content, exportType, normalizeFileName(fileName, extension ?? 'xls', fileNameFormatter))
    }
    case 'xml': {
      const content = createXMLData(safeData)

      return processor(content, exportType, normalizeFileName(fileName, extension ?? 'xml', fileNameFormatter))
    }
    default:
      throw new Error(MESSAGE_UNKNOWN_EXPORT_TYPE)
  }
}

exportFromJSON.types = exportTypes

exportFromJSON.processors = { downloadFile }

export default exportFromJSON
