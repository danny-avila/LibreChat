<h1 align="center">Export From JSON</h1>

<div align="center">

Export to plain text, css, html, json, csv, xls, xml files from JSON.

[![Known Vulnerabilities](https://snyk.io/test/github/zheeeng/export-from-json/badge.svg)](https://snyk.io/test/github/zheeeng/export-from-json)
[![Maintainability](https://api.codeclimate.com/v1/badges/2fbc35f65ba61bc190e1/maintainability)](https://codeclimate.com/github/zheeeng/export-from-json/maintainability)
[![language](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg)](http://typescriptlang.org/)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/zheeeng/export-from-json/blob/main/LICENSE)
[![Build Status](https://travis-ci.org/zheeeng/export-from-json.svg?branch=main)](https://travis-ci.org/zheeeng/export-from-json)
[![npm version](https://img.shields.io/npm/v/export-from-json.svg)](https://www.npmjs.com/package/export-from-json)
[![npm bundle size (minified + gzip)](https://img.shields.io/bundlephobia/minzip/export-from-json.svg)](https://unpkg.com/export-from-json/dist/umd/index.min.js)
[![NPM](https://nodei.co/npm/export-from-json.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/export-from-json/)

</div>

## Installation

```sh
yarn add export-from-json
```

or

```sh
npm i --save export-from-json
```

or

```sh
pnpm i --save export-from-json
```

## Usage

`exportFromJSON` supports CommonJS, EcmaScript Module, UMD importing.

`exportFromJSON` receives the option as the [Types Chapter](#types) demonstrated, and it uses a [front-end downloader](https://github.com/zheeeng/export-from-json/blob/main/src/processors.ts) as the default processor. In browser environment, there is a **content size limitation** on the default processor, consider using the [server side solution](#in-nodejs-server).

### In module system

```javascript
import exportFromJSON from 'export-from-json'

const data = [{ foo: 'foo'}, { bar: 'bar' }]
const fileName = 'download'
const exportType =  exportFromJSON.types.csv

exportFromJSON({ data, fileName, exportType })
```

### In browser

Check the [codepen example](https://codepen.io/zheeeng/pen/PQxBKr)

```javascript
<script src="https://unpkg.com/export-from-json/dist/umd/index.min.js"></script>
<script>
    const data = [{ foo: 'foo'}, { bar: 'bar' }]
    const fileName = 'download'
    const exportType = 'csv'

    window.exportFromJSON({ data, fileName, exportType })
</script>
```

### In Node.js server

`exportFromJSON` returns what the option `processor` returns, we can use it on server side for providing a converting/downloading service:

```javascript
const http = require('http')
const exportFromJSON = require('export-from-json')

http.createServer(function (request, response){
    // exportFromJSON actually supports passing JSON as the data option. It's very common that reading it from http request directly.
    const data = '[{"foo":"foo"},{"bar":"bar"}]'
    const fileName = 'download'
    const exportType = 'txt'

    const result = exportFromJSON({
        data,
        fileName,
        exportType,
        processor (content, type, fileName) {
            switch (type) {
                case 'txt':
                    response.setHeader('Content-Type', 'text/plain')
                    break
                case 'css':
                    response.setHeader('Content-Type', 'text/css')
                    break
                case 'html':
                    response.setHeader('Content-Type', 'text/html')
                    break
                case 'json':
                    response.setHeader('Content-Type', 'text/plain')
                    break
                case 'csv':
                    response.setHeader('Content-Type', 'text/csv')
                    break
                case 'xls':
                    response.setHeader('Content-Type', 'application/vnd.ms-excel')
                    break
            }
            response.setHeader('Content-disposition', 'attachment;filename=' + fileName)
            return content
        }
    })

    response.write(result)
    response.end()
}).listen(8080, '127.0.0.1')
```

## Types

**Note:** `JSON` refers to a parsable JSON string or a serializable JavaScript object.

| Option name | Required | Type | Description
| ----------- | -------- | ---- | ----
| data        | true     | `Array<JSON>`, `JSON` or `string` | If the exportType is 'json', data can be any parsable JSON. If the exportType is 'csv' or 'xls', data can only be an array of parsable JSON.  If the exportType is 'txt', 'css', 'html', the data must be a string type.
| fileName    | false    | string | filename without extension, default to `'download'`
| extension    | false    | string | filename extension, by default it takes the exportType
| fileNameFormatter    | false    | `(name: string) => string` | filename formatter, by default the file name will be formatted to snake case
| fields      | false    | `string[]` or field name mapper type `Record<string, string>`  | fields filter, also supports mapper field name by passing an name mapper, e.g. { 'bar': 'baz' }, default to `undefined`
| exportType  | false    | Enum ExportType | 'txt'(default), 'css', 'html', 'json', 'csv', 'xls', 'xml'
| processor   | false    | `(content: string, type: ExportType, fileName: string) => any` | default to a front-end downloader
| withBOM     | false    | boolean | Add BOM(byte order mark) meta to CSV file. BOM is expected by `Excel` when reading UTF8 CSV file. It is default to `false`.
| beforeTableEncode     | false    | `(entries: { fieldName: string, fieldValues: string[] }[]) => { fieldName: string, fieldValues: string[] }[]` | Given a chance to altering table entries, only works for `CSV` and `XLS` file, by default no altering.
| delimiter   | false    | `',' \| ';'` | Specify CSV raw data's delimiter between values. It is default to `,`

### Tips

* You can reference these exported types through a mounted static field `types`, e.g.

```js
exportFromJSON({ data: jsonData, fileName: 'data', exportType: exportFromJSON.types.csv })
```

* You can transform the data before exporting by `beforeTableEncode`, e.g.

```js
exportFromJSON({
    data: jsonData,
    fileName: 'data',
    exportType: exportFromJSON.types.csv,
    beforeTableEncode: rows => rows.sort((p, c) => p.fieldName.localeCompare(c.fieldName)),
})
```
