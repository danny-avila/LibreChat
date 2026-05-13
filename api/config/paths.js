const path = require('path');

const customPath = process.env.CUSTOM_THEME_PATH
  ? path.resolve(process.env.CUSTOM_THEME_PATH)
  : path.resolve(__dirname, '..', '..', 'custom');

module.exports = {
  root: path.resolve(__dirname, '..', '..'),
  uploads: path.resolve(__dirname, '..', '..', 'uploads'),
  clientPath: path.resolve(__dirname, '..', '..', 'client'),
  dist: path.resolve(__dirname, '..', '..', 'client', 'dist'),
  publicPath: path.resolve(__dirname, '..', '..', 'client', 'public'),
  fonts: path.resolve(__dirname, '..', '..', 'client', 'public', 'fonts'),
  assets: path.resolve(__dirname, '..', '..', 'client', 'public', 'assets'),
  imageOutput: path.resolve(__dirname, '..', '..', 'client', 'public', 'images'),
  customTheme: customPath,
  structuredTools: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'structured'),
  pluginManifest: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'manifest.json'),
};
