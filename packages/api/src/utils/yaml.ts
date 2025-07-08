import fs from 'fs';
import yaml from 'js-yaml';

export function loadYaml(filepath: string) {
  try {
    const fileContents = fs.readFileSync(filepath, 'utf8');
    return yaml.load(fileContents);
  } catch (e) {
    return e;
  }
}
