
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./tailwind-merge.cjs.production.min.js')
} else {
  module.exports = require('./tailwind-merge.cjs.development.js')
}
