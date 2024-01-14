const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

/**
 * This class is responsible for loading the environment variables
 *
 * Inspired by: https://thekenyandev.com/blog/environment-variables-strategy-for-node/
 */
class Env {
  constructor() {
    this.envMap = {
      default: '.env',
      development: '.env.development',
      test: '.env.test',
      production: '.env.production',
    };

    this.init();

    this.isProduction = process.env.NODE_ENV === 'production';
    this.domains = {
      client: process.env.DOMAIN_CLIENT,
      server: process.env.DOMAIN_SERVER,
    };
  }

  /**
   * Initialize the environment variables
   */
  init() {
    let hasDefault = false;
    // Load the default env file if it exists
    if (fs.existsSync(this.envMap.default)) {
      hasDefault = true;
      dotenv.config({
        // path: this.resolve(this.envMap.default),
        path: path.resolve(__dirname, '..', this.envMap.default),
      });
    } else {
      console.warn('The default .env file was not found');
    }

    const environment = this.currentEnvironment();

    // Load the environment specific env file
    const envFile = this.envMap[environment];

    // check if the file exists
    if (fs.existsSync(envFile)) {
      dotenv.config({
        // path: this.resolve(envFile),
        path: path.resolve(__dirname, '..', envFile),
      });
    } else if (!hasDefault) {
      console.warn('No env files found, have you completed the install process?');
    }
  }

  /**
   * Validate Config
   */
  validate() {
    const requiredKeys = [
      'NODE_ENV',
      'JWT_SECRET',
      'DOMAIN_CLIENT',
      'DOMAIN_SERVER',
      'CREDS_KEY',
      'CREDS_IV',
    ];

    const missingKeys = requiredKeys
      .map((key) => {
        const variable = process.env[key];
        if (variable === undefined || variable === null) {
          return key;
        }
      })
      .filter((value) => value !== undefined);

    // Throw an error if any required keys are missing
    if (missingKeys.length) {
      const message = `
        The following required env variables are missing:
            ${missingKeys.toString()}.
        Please add them to your env file or run 'npm run install'
      `;
      throw new Error(message);
    }

    // Check JWT secret for default
    if (process.env.JWT_SECRET === 'secret') {
      console.warn('Warning: JWT_SECRET is set to default value');
    }
  }

  /**
   * Resolve the location of the env file
   *
   * @param {String} envFile
   * @returns
   */
  resolve(envFile) {
    return path.resolve(process.cwd(), envFile);
  }

  /**
   * Add secure keys to the env
   *
   * @param {String} filePath The path of the .env you are updating
   * @param {String} key The env you are adding
   * @param {Number} length The length of the secure key
   */
  addSecureEnvVar(filePath, key, length) {
    const env = {};
    env[key] = this.generateSecureRandomString(length);
    this.writeEnvFile(filePath, env);
  }

  /**
   * Write the change to the env file
   */
  writeEnvFile(filePath, env) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const updatedLines = lines
      .map((line) => {
        if (line.trim().startsWith('#')) {
          // Allow comment removal
          if (env[line] === 'remove') {
            return null; // Mark the line for removal
          }
          // Preserve comments
          return line;
        }

        const [key, value] = line.split('=');
        if (key && value && Object.prototype.hasOwnProperty.call(env, key.trim())) {
          if (env[key.trim()] === 'remove') {
            return null; // Mark the line for removal
          }
          return `${key.trim()}=${env[key.trim()]}`;
        }
        return line;
      })
      .filter((line) => line !== null); // Remove lines marked for removal

    // Add any new environment variables that are not in the file yet
    Object.entries(env).forEach(([key, value]) => {
      if (value !== 'remove' && !updatedLines.some((line) => line.startsWith(`${key}=`))) {
        updatedLines.push(`${key}=${value}`);
      }
    });

    // Loop through updatedLines and wrap values with spaces in double quotes
    const fixedLines = updatedLines.map((line) => {
      // lets only split the first = sign
      const [key, value] = line.split(/=(.+)/);
      if (typeof value === 'undefined' || line.trim().startsWith('#')) {
        return line;
      }
      // Skip lines with quotes and numbers already
      // Todo: this could be one regex
      const wrappedValue =
        value.includes(' ') && !value.includes('"') && !value.includes('\'') && !/\d/.test(value)
          ? `"${value}"`
          : value;
      return `${key}=${wrappedValue}`;
    });

    const updatedContent = fixedLines.join('\n');
    fs.writeFileSync(filePath, updatedContent);
  }

  /**
   * Generate Secure Random Strings
   *
   * @param {Number} length The length of the random string
   * @returns
   */
  generateSecureRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Get all the environment variables
   */
  all() {
    return process.env;
  }

  /**
   * Get an environment variable
   *
   * @param {String} variable
   * @returns
   */
  get(variable) {
    return process.env[variable];
  }

  /**
   * Get the current environment name
   *
   * @returns {String}
   */
  currentEnvironment() {
    return this.get('NODE_ENV');
  }

  /**
   * Are we running in development?
   *
   * @returns {Boolean}
   */
  isDevelopment() {
    return this.currentEnvironment() === 'development';
  }

  /**
   * Are we running tests?
   *
   * @returns {Boolean}
   */
  isTest() {
    return this.currentEnvironment() === 'test';
  }

  /**
   * Are we running in production?
   *
   * @returns {Boolean}
   */
  isProduction() {
    return this.currentEnvironment() === 'production';
  }

  /**
   * Are we running in CI?
   *
   * @returns {Boolean}
   */
  isCI() {
    return this.currentEnvironment() === 'CI';
  }
}

const env = new Env();

module.exports = env;
