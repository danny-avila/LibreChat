import { isArray, getEntries, normalizeXMLName, indent, stripHTML, assert, getKeys } from './utils.js'

export function _createFieldsMapper (fields?: string[] | Record<string, string>) {
  if (
    !fields
    || isArray(fields) && !fields.length
    || !isArray(fields) && !getKeys(fields).length
  ) return (item: Record<string, unknown> | Array<Record<string, unknown>>) => item

  const mapper = isArray(fields)
    ? fields.reduce(
        (map, key) => ({ ...map, [key]: key}),
        Object.create(null) as Record<string, string>,
      )
    : fields

  return (item: Record<string, unknown> | Array<Record<string, unknown>>) => {
    if (isArray(item)) {
      return item
        .map(
          i => getEntries<unknown>(i).reduce(
            (map, [key, value]) => {
              if (key in mapper) {
                map[mapper[key]] = value
              }

              return map
            },
            Object.create(null) as Record<string, unknown>,
          ),
        )
        .filter(
          i => getKeys(i).length,
        )
    }

    return getEntries<unknown>(item).reduce(
      (map, [key, value]) => {
        if (key in mapper) {
          map[mapper[key]] = value
        }

        return map
      },
      Object.create(null) as Record<string, unknown>,
    )
  }
}

export function _prepareData (data: object | string): Record<string, unknown> {
  const MESSAGE_VALID_JSON_FAIL = 'Invalid export data. Please provide a valid JSON'
  try {
    return (typeof data === 'string' ? JSON.parse(data) : data) as Record<string, unknown>
  } catch {
    throw new Error(MESSAGE_VALID_JSON_FAIL)
  }
}

// TODO:: execute toSchema implicit converting
export function _createJSONData (
  data: object,
  replacer: ((key: string, value: any) => any) | Array<number | string> | null = null,
  space: string | number,
) {
  const MESSAGE_VALID_JSON_FAIL = 'Invalid export data. Please provide valid JSON object'
  try {
    return JSON.stringify(data, replacer as any, space)
  } catch {
    throw new Error(MESSAGE_VALID_JSON_FAIL)
  }
}

export interface ITableMap {
  [key: string]: string[],
}

export function _createTableMap (data: any[]): ITableMap {
  return data.map(getEntries).reduce(
    (tMap, rowKVs, rowIndex) =>
      rowKVs.reduce(
        (map, [key, value]) => {
          const columnValues = map[key] || Array.from({ length: data.length }).map(_ => '')
          columnValues[rowIndex] =
            (typeof value !== 'string' ? JSON.stringify(value) : value) || ''
          map[key] = columnValues

          return map
        },
        tMap,
      ),
    Object.create(null) as Partial<ITableMap>,
  ) as ITableMap
}

export interface ITableEntries extends Array<{ fieldName: string, fieldValues: string[] }> {}

export function _createTableEntries (
  tableMap: ITableMap,
  beforeTableEncode: (entries: ITableEntries) => ITableEntries = i => i,
): ITableEntries {
  return beforeTableEncode(getEntries(tableMap).map(([fieldName, fieldValues]) => ({
    fieldName,
    fieldValues,
  })))
}

// Rule: Fields that contain commas must begin and end with double quotes.
// Addition Rule: Fields that contain double quotes must begin and end with double quotes.
// Rule: Fields that contain line breaks must begin and end with double quotes
//       (not all programs support values with line breaks).
// Rule: All other fields do not require double quotes.
// Rule: Double quotes within values are represented by two contiguous double quotes.
function encloser (value: string, delimiter: ',' | ';') {
  const enclosingTester = new RegExp(`${delimiter}|"|\n`)
  const enclosingCharacter = enclosingTester.test(value) ? '"' : ''
  const escaped = value.replace(/"/g, '""')

  return `${enclosingCharacter}${escaped}${enclosingCharacter}`
}

interface CreateCSVDataOptions {
  beforeTableEncode?: (entries: ITableEntries) => ITableEntries,
  delimiter?: ',' | ';',
}

const defaultCreateCSVDataOption: Required<CreateCSVDataOptions> = { beforeTableEncode: i => i, delimiter: ',' }

// Reference: https://techterms.com/definition/csv
export function createCSVData (
  data: any[],
  options: CreateCSVDataOptions = {},
) {
  const { beforeTableEncode, delimiter } = { ...defaultCreateCSVDataOption, ...options }

  if (!data.length) return ''

  const tableMap = _createTableMap(data)
  const tableEntries = _createTableEntries(tableMap, beforeTableEncode)

  // Rule: Columns (fields) are separated by commas.
  // Rule: Rows are separated by line breaks (newline characters).
  const head = tableEntries.map(({ fieldName }) => fieldName).join(delimiter) + '\r\n'
  const columns = tableEntries.map(({ fieldValues }) => fieldValues)
    .map(column => column.map(value => encloser(value, delimiter)))
  const rows = columns.reduce(
    (mergedColumn, column) => mergedColumn.map((value, rowIndex) => `${value}${delimiter}${column[rowIndex]}`),
  )

  return head + rows.join('\r\n')
}

export function _renderTableHTMLText (
  data: any[],
  beforeTableEncode: (entries: ITableEntries) => ITableEntries,
) {
  assert(data.length > 0)

  const tableMap = _createTableMap(data)
  const tableEntries = _createTableEntries(tableMap, beforeTableEncode)
  const head = tableEntries.map(({ fieldName }) => fieldName)
    .join('</b></th><th><b>')
  const columns = tableEntries.map(({ fieldValues }) => fieldValues)
    .map(column => column.map(value => `<td>${value}</td>`))
  const rows = columns.reduce(
    (mergedColumn, column) => mergedColumn
      .map((value, rowIndex) => `${value}${column[rowIndex]}`),
  )

  return `
    <table>
      <thead>
        <tr><th><b>${head}</b></th></tr>
      </thead>
      <tbody>
        <tr>${rows.join(`</tr>
        <tr>`)}</tr>
      </tbody>
    </table>
  `
}

interface CreateXLSDataOptions {
  beforeTableEncode?: (entries: ITableEntries) => ITableEntries,
}

const defaultCreateXLSDataOptions: Required<CreateXLSDataOptions> = { beforeTableEncode: i => i }

export function createXLSData (data: any[], options?: CreateXLSDataOptions) {
  const { beforeTableEncode } = { ...defaultCreateXLSDataOptions, ...options }

  if (!data.length) return ''

  const content =
`<html>
  <head>
    <meta charset="UTF-8" />
  </head >
  <body>
    ${_renderTableHTMLText(data, beforeTableEncode)}
  </body>
</html >
`

  return content
}

export function createXMLData (data: object) {
  const content =

`<?xml version="1.0" encoding="utf-8"?><!DOCTYPE base>
${_renderXML(data, 'base')}
`

  return content
}

function _renderXML (data: any, tagName: string, arrayElementTag = 'element', spaces = 0): string {
  const tag = normalizeXMLName(tagName)
  const indentSpaces = indent(spaces)

  if (data === null || data === undefined) {
    return `${indentSpaces}<${tag} />`
  }

  const content = isArray(data)
    ? data.map(item => _renderXML(item, arrayElementTag, arrayElementTag, spaces + 2)).join('\n')
    : typeof data === 'object'
      ? getEntries(data as Record<string, unknown>)
        .map(([key, value]) => _renderXML(value, key, arrayElementTag, spaces + 2)).join('\n')
      : indentSpaces + '  ' + stripHTML(String(data))

  const contentWithWrapper =

`${indentSpaces}<${tag}>
${content}
${indentSpaces}</${tag}>`

  return contentWithWrapper
}
