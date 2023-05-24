const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

/**
 * This class is responsible for loading the environment variables
 *
 * Inspired by: https://thekenyandev.com/blog/environment-variables-strategy-for-node/
 */
class Env {
  constructor() {
    this.envMap = {
      default: '.env',
      development: '.env.dev',
      test: '.env.test',
      production: '.env.prod',
    }

    this.init();
  }

  /**
   * Initialize the environment variables
   */
  init() {
    if (!fs.existsSync(this.envMap.default)) {
      throw new Error("Please add a .env file to the root directory");
    }

    // Load the default env file
    dotenv.config({
      path: path.resolve(process.cwd(), this.envMap.default),
    });

    const environment = this.currentEnvironment();

    // Load the environment specific env file
    const envFile = this.envMap[environment];

    // check if the file exists
    if (fs.existsSync(envFile)) {
      dotenv.config({
        path: path.resolve(process.cwd(), envFile),
      });
    }
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
    return this.getEnvironmentVariable('NODE_ENV');
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
    return this.currentEnvironment() === 'ci';
  }
}

const env = new Env();

module.exports = env;
