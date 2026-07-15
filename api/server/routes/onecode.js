const express = require('express');
const { requireJwtAuth } = require('~/server/middleware');
const {
  createOneCodeProject,
  discoverOneCodeModels,
  getOneCodeModelConfig,
  getOneCodeRunEvidence,
  getOneCodeProjectStatus,
  getOneCodeVerifierPolicy,
  getOneCodeVerifierPresets,
  initOneCodeProject,
  inspectOneCodeRun,
  isLocalRequest,
  listOneCodeRuns,
  pickOneCodeProjectFolder,
  resumeOneCodeRun,
  runOneCodeDoctor,
  runOneCodeSelfAudit,
  syncOneCodeFilesystemMCP,
  writeOneCodeModelConfig,
  writeOneCodeVerifierPolicy,
} = require('~/server/services/OneCode/projectPicker');

const router = express.Router();

function requireLocalRequest(req, res, next) {
  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: 'OneCode project picker is local-only' });
  }
  next();
}

function requiredWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('workspace is required');
  }
  return value;
}

router.use(requireJwtAuth, requireLocalRequest);

router.post('/projects/pick', async (_req, res) => {
  try {
    res.json(await pickOneCodeProjectFolder());
  } catch (error) {
    res.status(500).json({ error: error.message || 'failed to pick OneCode project folder' });
  }
});

router.post('/projects/create', async (req, res) => {
  try {
    res.json(await createOneCodeProject(req.body?.name));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to create OneCode project' });
  }
});

router.post('/projects/mcp/sync', async (req, res) => {
  try {
    res.json(await syncOneCodeFilesystemMCP(req.body?.workspace, req.user?.id));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to sync OneCode filesystem MCP' });
  }
});

router.get('/projects/status', async (req, res) => {
  try {
    res.json(await getOneCodeProjectStatus(requiredWorkspace(req.query?.workspace)));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to get OneCode project status' });
  }
});

router.post('/projects/init', async (req, res) => {
  try {
    res.json(await initOneCodeProject(req.body?.workspace));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to initialize OneCode project' });
  }
});

router.get('/runs', async (req, res) => {
  try {
    res.json(await listOneCodeRuns(req.query?.workspace, req.query?.limit));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to list OneCode runs' });
  }
});

router.get('/runs/:runId/inspect', async (req, res) => {
  try {
    res.json(await inspectOneCodeRun(req.query?.workspace, req.params.runId));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to inspect OneCode run' });
  }
});

router.get('/runs/:runId/evidence', async (req, res) => {
  try {
    res.json(await getOneCodeRunEvidence(req.query?.workspace, req.params.runId));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to get OneCode run evidence' });
  }
});

router.post('/runs/:runId/resume', async (req, res) => {
  try {
    res.json(await resumeOneCodeRun(req.body?.workspace, req.params.runId, req.body?.message));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to resume OneCode run' });
  }
});

router.get('/verifier/presets', async (_req, res) => {
  try {
    res.json(await getOneCodeVerifierPresets());
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to get OneCode verifier presets' });
  }
});

router.get('/verifier/policy', async (req, res) => {
  try {
    res.json(await getOneCodeVerifierPolicy(req.query?.workspace));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to get OneCode verifier policy' });
  }
});

router.post('/verifier/policy', async (req, res) => {
  try {
    res.json(
      await writeOneCodeVerifierPolicy(req.body?.workspace, req.body?.presetIds, req.body?.force),
    );
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to write OneCode verifier policy' });
  }
});

router.get('/model-config', async (_req, res) => {
  try {
    res.json(await getOneCodeModelConfig());
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to get OneCode model config' });
  }
});

router.post('/model-config', async (req, res) => {
  try {
    res.json(await writeOneCodeModelConfig(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to write OneCode model config' });
  }
});

router.post('/models/discover', async (req, res) => {
  try {
    res.json(await discoverOneCodeModels(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to discover OneCode models' });
  }
});

router.post('/doctor', async (_req, res) => {
  try {
    res.json(await runOneCodeDoctor());
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to run OneCode doctor' });
  }
});

router.post('/audit-self', async (_req, res) => {
  try {
    res.json(await runOneCodeSelfAudit());
  } catch (error) {
    res.status(400).json({ error: error.message || 'failed to run OneCode self audit' });
  }
});

module.exports = router;
