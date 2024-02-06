(function () {
  const dotenvExpand = require('./lib/main').expand

  const env = require('dotenv').config()

  return dotenvExpand(env)
})()
