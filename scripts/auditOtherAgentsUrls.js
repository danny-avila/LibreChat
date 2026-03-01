const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '../api') });

const CatalogTool = require('../api/app/clients/tools/structured/WoodlandAISearchCatalog');
const EngineTool = require('../api/app/clients/tools/structured/WoodlandEngineHistory');
const ProductTool = require('../api/app/clients/tools/structured/WoodlandProductHistory');

function collectMatches(obj, targets, basePath = '') {
  const hits = [];
  const walk = (value, currentPath) => {
    if (value == null) return;
    if (typeof value === 'string') {
      if (targets.some((target) => value.includes(target))) {
        hits.push({ path: currentPath, value });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => {
        walk(entry, currentPath ? `${currentPath}.${key}` : key);
      });
    }
  };
  walk(obj, basePath);
  return hits;
}

function summarizeHits(hits) {
  const homepageExact = hits.filter((item) => item.value === 'https://www.cyclonerake.com/');
  const badSlug = hits.filter(
    (item) => item.value.includes('mdavfckkvfhjv') || item.value.includes('dxzgmda'),
  );
  return {
    total: hits.length,
    homepageExactCount: homepageExact.length,
    badSlugCount: badSlug.length,
  };
}

async function run() {
  const targets = ['https://www.cyclonerake.com/', 'mdavfckkvfhjv', 'dxzgmda'];

  const catalog = new CatalogTool({});
  const catalogRaw = await catalog._call({ query: '230-019', top: 8 });
  const catalogData = JSON.parse(catalogRaw);
  const catalogHits = collectMatches(catalogData, targets);

  const engine = new EngineTool({});
  const engineRaw = await engine._call({ query: 'Vanguard 6.5', top: 8 });
  const engineData = JSON.parse(engineRaw);
  const engineHits = collectMatches(engineData, targets);

  const product = new ProductTool({});
  const productRaw = await product._call({ query: 'Commander 230-019', top: 8 });
  const productData = JSON.parse(productRaw);
  const productHits = collectMatches(productData, targets);

  const report = {
    containsTargets: targets,
    catalog: {
      resultCount: Array.isArray(catalogData) ? catalogData.length : 0,
      summary: summarizeHits(catalogHits),
      suspiciousMatches: catalogHits,
    },
    engine: {
      resultCount: Array.isArray(engineData) ? engineData.length : 0,
      summary: summarizeHits(engineHits),
      suspiciousMatches: engineHits,
    },
    product: {
      resultCount: Array.isArray(productData) ? productData.length : 0,
      summary: summarizeHits(productHits),
      suspiciousMatches: productHits,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
