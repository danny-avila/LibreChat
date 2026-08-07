import { readFileSync } from 'node:fs';

const manifestIndex = JSON.parse(readFileSync(0, 'utf8'));
const platforms = new Set(
  (manifestIndex.manifests ?? []).map(
    (manifest) => `${manifest.platform?.os}/${manifest.platform?.architecture}`,
  ),
);

for (const requiredPlatform of ['linux/amd64', 'linux/arm64']) {
  if (!platforms.has(requiredPlatform)) {
    throw new Error(`No-op image manifest is missing ${requiredPlatform}`);
  }
}

console.log('No-op image supports Linux amd64 and arm64');
