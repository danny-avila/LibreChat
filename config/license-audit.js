#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.resolve(
  process.env.LICENSE_AUDIT_DIR || path.join(rootDir, 'artifacts/license-audit'),
);
const allowedLicenseExpressions = new Set([
  'MIT',
  'Apache-2.0',
  'MIT OR Apache-2.0',
  'Apache-2.0 OR MIT',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeLicense(license) {
  if (!license) {
    return 'UNKNOWN';
  }
  if (typeof license === 'string') {
    return license.replace(/\s+/g, ' ').trim();
  }
  if (typeof license === 'object' && typeof license.type === 'string') {
    return normalizeLicense(license.type);
  }
  return String(license);
}

function isAllowedLicense(license) {
  const normalized = normalizeLicense(license)
    .replace(/^\((.*)\)$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return allowedLicenseExpressions.has(normalized);
}

function packageNameFromNodeModulesPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index === -1) {
    return undefined;
  }

  const parts = lockPath.slice(index + marker.length).split('/');
  if (parts[0]?.startsWith('@')) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

function readInstalledPackageLicense(lockPath) {
  const packageJsonPath = path.join(rootDir, lockPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }
  try {
    return normalizeLicense(readJson(packageJsonPath).license);
  } catch {
    return undefined;
  }
}

function workspaceManifestPaths() {
  return [
    'package.json',
    'api/package.json',
    'client/package.json',
    'packages/api/package.json',
    'packages/client/package.json',
    'packages/data-provider/package.json',
    'packages/data-schemas/package.json',
  ];
}

function collectWorkspaceManifests() {
  return workspaceManifestPaths()
    .filter((manifestPath) => fs.existsSync(path.join(rootDir, manifestPath)))
    .map((manifestPath) => {
      const manifest = readJson(path.join(rootDir, manifestPath));
      const license = normalizeLicense(manifest.license);
      return {
        type: 'workspace',
        name: manifest.name || manifestPath,
        version: manifest.version || '',
        location: manifestPath,
        license,
        allowed: isAllowedLicense(license),
        use: 'LibreChat source package manifest',
        consideration:
          license === 'UNKNOWN'
            ? 'No package manifest license is declared; resolve before redistribution.'
            : 'Retain copyright/license notices when redistributing.',
      };
    });
}

function collectNpmPackages() {
  const packageLock = readJson(path.join(rootDir, 'package-lock.json'));
  const byKey = new Map();

  for (const [lockPath, packageInfo] of Object.entries(packageLock.packages || {})) {
    if (!lockPath.includes('node_modules/')) {
      continue;
    }

    const name = packageInfo.name || packageNameFromNodeModulesPath(lockPath);
    const version = packageInfo.version || '';
    const license = normalizeLicense(packageInfo.license || readInstalledPackageLicense(lockPath));
    const scope = packageInfo.dev ? 'dev' : 'runtime';
    const key = `${name}@${version}|${license}|${scope}`;

    if (!byKey.has(key)) {
      byKey.set(key, {
        type: 'npm',
        name,
        version,
        location: lockPath,
        license,
        allowed: isAllowedLicense(license),
        scope,
        pathCount: 0,
        use:
          scope === 'dev'
            ? 'JavaScript development/test/build dependency'
            : 'JavaScript runtime or bundled application dependency',
        consideration:
          license === 'UNKNOWN'
            ? 'Package license was not present in package-lock.json or installed package metadata; manually review before redistribution.'
            : 'Retain third-party notices and satisfy the package license terms when redistributing.',
      });
    }

    const item = byKey.get(key);
    item.pathCount += 1;
  }

  return [...byKey.values()].sort((a, b) =>
    `${a.license} ${a.name} ${a.version}`.localeCompare(`${b.license} ${b.name} ${b.version}`),
  );
}

function collectRuntimeComponents() {
  const ragEnabled = process.env.RAG_ENABLED === 'true';
  const ragSource = {
    url: process.env.RAG_API_SOURCE_URL || 'not configured',
    ref: process.env.RAG_API_SOURCE_REF || 'not configured',
    license: process.env.RAG_API_SOURCE_LICENSE || 'not configured',
    reviewed: process.env.RAG_API_LICENSE_REVIEWED === 'true',
  };

  return [
    {
      type: 'container',
      name: 'nginx gateway image',
      version: 'configured by GATEWAY_IMAGE',
      location: 'deploy-compose.ferretdb.yml; deploy/ferretdb/images.linux-amd64.env',
      license: 'BSD-2-Clause',
      allowed: false,
      use: 'Tenant gateway reverse proxy container.',
      consideration:
        'Permissive but not MIT/Apache-2.0; retain notices when redistributing images or derived bundles.',
    },
    {
      type: 'container',
      name: 'Valkey image',
      version: 'configured by VALKEY_IMAGE',
      location: 'deploy-compose.ferretdb.yml; deploy/ferretdb/images.linux-amd64.env',
      license: 'BSD-3-Clause',
      allowed: false,
      use: 'Redis-protocol cache and streams backend. The compose service remains named redis for LibreChat compatibility.',
      consideration:
        'Permissive but not MIT/Apache-2.0; retain notices when redistributing images or derived bundles.',
    },
    {
      type: 'avoided-component',
      name: 'Redis Community Edition 7.4+',
      version: 'not used by this deployment',
      location: 'deploy-compose.ferretdb.yml uses VALKEY_IMAGE instead',
      license: 'RSALv2 OR SSPLv1',
      allowed: false,
      use: 'Explicitly avoided cache backend; Valkey provides the Redis-compatible protocol path.',
      consideration:
        'Do not switch this deployment back to redis:7.4+ unless your commercial policy approves RSALv2/SSPLv1 or a separate Redis license.',
    },
    {
      type: 'optional-container',
      name: 'pgvector image',
      version: 'configured by PGVECTOR_IMAGE',
      location: 'deploy-compose.ferretdb.rag.yml; deploy/ferretdb/images.linux-amd64.env',
      license: 'PostgreSQL',
      allowed: false,
      use: 'Optional PostgreSQL vector database for LibreChat RAG when RAG_ENABLED=true.',
      consideration: ragEnabled
        ? 'Active because RAG_ENABLED=true. Permissive but not MIT/Apache-2.0; retain PostgreSQL/pgvector notices.'
        : 'Inactive in the default commercial runtime because RAG_ENABLED=false. Review and retain PostgreSQL/pgvector notices before enabling RAG.',
    },
    {
      type: 'container',
      name: 'MinIO server image',
      version: 'configured by MINIO_IMAGE',
      location: 'deploy-compose.ferretdb.yml; deploy/ferretdb/.env.example',
      license: 'AGPL-3.0-only OR commercial',
      allowed: false,
      use: 'Internal S3-compatible object store only when the MinIO path is selected.',
      consideration:
        'Do not use in this no-AGPL production path without a commercial MinIO license. The SeaweedFS override disables it for normal runtime.',
    },
    {
      type: 'container',
      name: 'MinIO client image',
      version: 'configured by MINIO_MC_IMAGE',
      location: 'deploy-compose.ferretdb.yml; deploy/ferretdb/.env.example',
      license: 'AGPL-3.0-only OR commercial',
      allowed: false,
      use: 'MinIO bucket initialization/backup helper only when the MinIO path is selected.',
      consideration:
        'Avoid in the no-AGPL path unless covered by a commercial MinIO license; not used by the SeaweedFS override.',
    },
    {
      type: 'optional-container',
      name: 'LibreChat RAG API image',
      version: 'configured by RAG_API_IMAGE',
      location: 'deploy-compose.ferretdb.rag.yml; deploy/ferretdb/images.linux-amd64.env',
      license: 'UNKNOWN',
      allowed: false,
      use: 'Optional RAG API service container when RAG_ENABLED=true.',
      consideration: ragEnabled
        ? `Active because RAG_ENABLED=true. Source URL: ${ragSource.url}; source ref: ${ragSource.ref}; declared source license: ${ragSource.license}; review confirmed: ${ragSource.reviewed}. Confirm source, notices, image build provenance, and redistribution rights before commercial redistribution.`
        : 'Inactive in the default commercial runtime because RAG_ENABLED=false. Do not enable deploy-compose.ferretdb.rag.yml until source, license, notices, image build provenance, and redistribution rights are reviewed.',
    },
    {
      type: 'asset-reference',
      name: 'OpenAI official ChatGPT fonts',
      version: '',
      location: 'client/src/style.css',
      license: 'Proprietary font license required if enabled',
      allowed: false,
      use: 'Commented-out optional font-face guidance; no font files are included by default.',
      consideration:
        'Do not add or serve those font files unless your organization has the required web font license.',
    },
  ];
}

function collectAllowedRuntimeComponents() {
  return [
    {
      type: 'container',
      name: 'FerretDB image',
      license: 'Apache-2.0',
      location: 'deploy-compose.ferretdb.yml; deploy/ferretdb/images.linux-amd64.env',
    },
    {
      type: 'container',
      name: 'postgres-documentdb image',
      license: 'MIT',
      location: 'deploy-compose.ferretdb.yml; deploy/ferretdb/images.linux-amd64.env',
    },
    {
      type: 'container',
      name: 'SeaweedFS image',
      license: 'Apache-2.0',
      location: 'deploy-compose.ferretdb.seaweedfs.yml; deploy/ferretdb/images.linux-amd64.env',
    },
    {
      type: 'container',
      name: 'Meilisearch image',
      license: 'MIT',
      location: 'deploy-compose.ferretdb.yml; deploy/ferretdb/images.linux-amd64.env',
    },
  ];
}

function markdownTable(items) {
  const escape = (value) =>
    String(value ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>');
  const lines = [
    '| Type | Name | Version | Location | License | Use | Compliance / redistribution consideration |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const item of items) {
    lines.push(
      `| ${escape(item.type)} | ${escape(item.name)} | ${escape(item.version)} | ${escape(
        item.location,
      )} | ${escape(item.license)} | ${escape(item.use)} | ${escape(item.consideration)} |`,
    );
  }
  return lines.join('\n');
}

function writeReports(report) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'license-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const markdown = [
    '# License Audit',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    'Allowed baseline for this audit: `MIT`, `Apache-2.0`, `MIT OR Apache-2.0`, `Apache-2.0 OR MIT`.',
    '',
    'This is an inventory artifact, not legal advice. Unknown and non-baseline licenses need counsel or policy review before commercial redistribution.',
    '',
    '## Summary',
    '',
    `- Workspace manifests: ${report.summary.workspaceTotal}; non-baseline: ${report.summary.workspaceNonAllowed}`,
    `- NPM packages: ${report.summary.npmTotal}; non-baseline or unknown: ${report.summary.npmNonAllowed}`,
    `- Deployment/runtime callouts: ${report.summary.runtimeNonAllowed}`,
    `- Known allowed runtime components: ${report.summary.runtimeAllowed}`,
    '',
    '## Non-Baseline Workspace Items',
    '',
    markdownTable(report.nonAllowed.workspace),
    '',
    '## Non-Baseline Deployment And Runtime Items',
    '',
    markdownTable(report.nonAllowed.runtime),
    '',
    '## Non-Baseline NPM Packages',
    '',
    markdownTable(report.nonAllowed.npm),
    '',
    '## Known Allowed Deployment Components',
    '',
    '| Type | Name | Location | License |',
    '| --- | --- | --- | --- |',
    ...report.allowedRuntime.map(
      (item) => `| ${item.type} | ${item.name} | ${item.location} | ${item.license} |`,
    ),
    '',
    '## Gaps And Ambiguities',
    '',
    '- Container base-image layer licenses are not exhaustively enumerated by this script. Use a container SBOM scanner such as Syft/Grype or Trivy for final release evidence.',
    '- RAG is optional. When `RAG_ENABLED=false`, the RAG API image and pgvector service are not part of the default commercial runtime. When `RAG_ENABLED=true`, `deploy-compose.ferretdb.rag.yml` requires separate source/license review metadata.',
    '- NPM entries marked `UNKNOWN` did not expose license metadata in the lockfile or installed package manifest and need manual review.',
    '- The root repository contains a MIT `LICENSE` file while several package manifests declare `ISC`; resolve the intended outbound project license before redistribution.',
    '- No model or dataset artifacts were found by this script; if operators add models, datasets, fonts, or uploaded seed content, audit those separately.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, 'license-audit.md'), markdown);
}

function main() {
  const workspace = collectWorkspaceManifests();
  const npmPackages = collectNpmPackages();
  const runtime = collectRuntimeComponents();
  const allowedRuntime = collectAllowedRuntimeComponents();
  const nonAllowed = {
    workspace: workspace.filter((item) => !item.allowed),
    npm: npmPackages.filter((item) => !item.allowed),
    runtime: runtime.filter((item) => !item.allowed),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    allowedLicenses: [...allowedLicenseExpressions],
    summary: {
      workspaceTotal: workspace.length,
      workspaceNonAllowed: nonAllowed.workspace.length,
      npmTotal: npmPackages.length,
      npmNonAllowed: nonAllowed.npm.length,
      runtimeNonAllowed: nonAllowed.runtime.length,
      runtimeAllowed: allowedRuntime.length,
    },
    nonAllowed,
    allowedRuntime,
  };

  writeReports(report);
  console.log(JSON.stringify({ outputDir, summary: report.summary }, null, 2));

  if (process.env.LICENSE_AUDIT_FAIL_ON_FINDINGS === 'true') {
    const total =
      report.summary.workspaceNonAllowed +
      report.summary.npmNonAllowed +
      report.summary.runtimeNonAllowed;
    if (total > 0) {
      process.exitCode = 1;
    }
  }
}

main();
