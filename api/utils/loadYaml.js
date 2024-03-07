const fs = require('fs');
const yaml = require('js-yaml');

function loadYaml(filepath) {
  try {
    let fileContents = fs.readFileSync(filepath, 'utf8');
    return yaml.load(fileContents);
  } catch (e) {
    // console.error(e);
  }
}

module.exports = loadYaml;
