import pluginTester from 'babel-plugin-tester'
import plugin from '..'

pluginTester({
  plugin,
  pluginName: 'vite-meta-env',
  snapshot: true,
  tests: {
    'replace MODE': 'const x = import.meta.env.MODE',
    'replace BASE_URL': 'const x = import.meta.env.BASE_URL',
    'replace NODE_ENV': 'const x = import.meta.env.NODE_ENV',
    'replace DEV': 'const x = import.meta.env.DEV',
    'replace PROD': 'const x = import.meta.env.PROD',
    'replace VITE_* variables': 'const x = import.meta.env.VITE_VAR',
    'replace string access': 'const x = import.meta.env["VITE_VAR"]',
    'replace key access': 'const key = "VITE_VAR"; const x = import.meta.env[key]',
    'replace env object': 'const env = import.meta.env',
    'not replaceable': 'const x = import.meta.env.OTHER',
    'not import.meta.env': 'const x = import.meta.other',
    'not import.meta': 'const x = process.env.MODE',
    'not import.meta lookup': 'const x = import.meta()'
  }
})
