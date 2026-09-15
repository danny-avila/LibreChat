const fs = require('fs');
const path = require('path');
const express = require('express');
const swaggerUiDist = require('swagger-ui-dist');
const { logger } = require('@librechat/data-schemas');
const { getAppConfigOptionsFromUser } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config/app');

const router = express.Router();

const specPath = path.join(
  path.dirname(require.resolve('@librechat/api')),
  '..',
  'openapi',
  'agents.openapi.json',
);

const docsHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LibreChat Agents API</title>
    <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>`;

let cachedSpec;
function readSpec() {
  if (cachedSpec === undefined) {
    cachedSpec = fs.readFileSync(specPath, 'utf8');
  }
  return cachedSpec;
}

async function isDocsEnabled(req) {
  try {
    const appConfig = await getAppConfig(getAppConfigOptionsFromUser(req.user));
    return appConfig?.config?.openapi?.enabled === true;
  } catch (error) {
    logger.error('[openapi] Failed to read app config', error);
    return false;
  }
}

router.get('/openapi.json', async (req, res) => {
  if (!(await isDocsEnabled(req))) {
    return res.status(404).json({ message: 'Not Found' });
  }
  try {
    return res.type('application/json').send(readSpec());
  } catch (error) {
    logger.error('[openapi] Failed to read the OpenAPI spec', error);
    return res.status(500).json({ message: 'Failed to read the OpenAPI spec' });
  }
});

router.use('/docs/assets', express.static(swaggerUiDist.getAbsoluteFSPath()));

router.get('/docs', async (req, res) => {
  if (!(await isDocsEnabled(req))) {
    return res.status(404).json({ message: 'Not Found' });
  }
  return res.type('html').send(docsHtml);
});

module.exports = router;
