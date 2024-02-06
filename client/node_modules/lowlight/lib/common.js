// @ts-expect-error: this registers types for the language files.
/** @typedef {import('highlight.js/types/index.js')} DoNotTochItRegistersLanguageFiles */

import arduino from 'highlight.js/lib/languages/arduino'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import less from 'highlight.js/lib/languages/less'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import objectivec from 'highlight.js/lib/languages/objectivec'
import perl from 'highlight.js/lib/languages/perl'
import php from 'highlight.js/lib/languages/php'
import phpTemplate from 'highlight.js/lib/languages/php-template'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import pythonRepl from 'highlight.js/lib/languages/python-repl'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import vbnet from 'highlight.js/lib/languages/vbnet'
import wasm from 'highlight.js/lib/languages/wasm'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import {lowlight} from './core.js'

lowlight.registerLanguage('arduino', arduino)
lowlight.registerLanguage('bash', bash)
lowlight.registerLanguage('c', c)
lowlight.registerLanguage('cpp', cpp)
lowlight.registerLanguage('csharp', csharp)
lowlight.registerLanguage('css', css)
lowlight.registerLanguage('diff', diff)
lowlight.registerLanguage('go', go)
lowlight.registerLanguage('graphql', graphql)
lowlight.registerLanguage('ini', ini)
lowlight.registerLanguage('java', java)
lowlight.registerLanguage('javascript', javascript)
lowlight.registerLanguage('json', json)
lowlight.registerLanguage('kotlin', kotlin)
lowlight.registerLanguage('less', less)
lowlight.registerLanguage('lua', lua)
lowlight.registerLanguage('makefile', makefile)
lowlight.registerLanguage('markdown', markdown)
lowlight.registerLanguage('objectivec', objectivec)
lowlight.registerLanguage('perl', perl)
lowlight.registerLanguage('php', php)
lowlight.registerLanguage('php-template', phpTemplate)
lowlight.registerLanguage('plaintext', plaintext)
lowlight.registerLanguage('python', python)
lowlight.registerLanguage('python-repl', pythonRepl)
lowlight.registerLanguage('r', r)
lowlight.registerLanguage('ruby', ruby)
lowlight.registerLanguage('rust', rust)
lowlight.registerLanguage('scss', scss)
lowlight.registerLanguage('shell', shell)
lowlight.registerLanguage('sql', sql)
lowlight.registerLanguage('swift', swift)
lowlight.registerLanguage('typescript', typescript)
lowlight.registerLanguage('vbnet', vbnet)
lowlight.registerLanguage('wasm', wasm)
lowlight.registerLanguage('xml', xml)
lowlight.registerLanguage('yaml', yaml)

export {lowlight} from './core.js'
