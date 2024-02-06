'use strict'

function _interpolate (envValue, environment, config) {
  const matches = envValue.match(/(.?\${*[\w]*(?::-[\w/]*)?}*)/g) || []

  return matches.reduce(function (newEnv, match, index) {
    const parts = /(.?)\${*([\w]*(?::-[\w/]*)?)?}*/g.exec(match)
    if (!parts || parts.length === 0) {
      return newEnv
    }

    const prefix = parts[1]

    let value, replacePart

    if (prefix === '\\') {
      replacePart = parts[0]
      value = replacePart.replace('\\$', '$')
    } else {
      const keyParts = parts[2].split(':-')
      const key = keyParts[0]
      replacePart = parts[0].substring(prefix.length)
      // process.env value 'wins' over .env file's value
      value = Object.prototype.hasOwnProperty.call(environment, key)
        ? environment[key]
        : (config.parsed[key] || keyParts[1] || '')

      // If the value is found, remove nested expansions.
      if (keyParts.length > 1 && value) {
        const replaceNested = matches[index + 1]
        matches[index + 1] = ''

        newEnv = newEnv.replace(replaceNested, '')
      }
      // Resolve recursive interpolations
      value = _interpolate(value, environment, config)
    }

    return newEnv.replace(replacePart, value)
  }, envValue)
}

function expand (config) {
  // if ignoring process.env, use a blank object
  const environment = config.ignoreProcessEnv ? {} : process.env

  for (const configKey in config.parsed) {
    const value = Object.prototype.hasOwnProperty.call(environment, configKey) ? environment[configKey] : config.parsed[configKey]

    config.parsed[configKey] = _interpolate(value, environment, config)
  }

  for (const processKey in config.parsed) {
    environment[processKey] = config.parsed[processKey]
  }

  return config
}

module.exports.expand = expand
