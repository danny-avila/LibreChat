const crypto = require('crypto');
const express = require('express');
const { generateCheckAccess } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  createSkillSchedule,
  getSkillScheduleById,
  listSkillSchedules,
  updateSkillSchedule,
  deleteSkillSchedule,
  markScheduleResult,
  getUserById,
  getRoleByName,
} = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');
const configMiddleware = require('~/server/middleware/config/app');
const { computeNextRunAt, runScheduleManually } = require('~/server/services/Scheduler');
const { assertValidCron } = require('~/server/services/Scheduler/cron');

const router = express.Router();

const checkSkillAccess = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE],
  getRoleByName,
});

router.use(requireJwtAuth);
router.use(configMiddleware);
router.use(checkSkillAccess);

/**
 * Validates the scheduling fields and returns the initial `nextRunAt`.
 * Throws an Error with a user-facing message on invalid input.
 */
function resolveScheduleTiming(payload, from) {
  if (payload.scheduleType === 'recurring') {
    if (!payload.cron) {
      throw new Error('A recurring schedule requires a cron expression');
    }
    assertValidCron(payload.cron);
    const next = computeNextRunAt(
      { scheduleType: 'recurring', cron: payload.cron, timezone: payload.timezone },
      from,
    );
    if (!next) {
      throw new Error('The cron expression has no upcoming runs');
    }
    return next;
  }
  if (payload.scheduleType === 'once') {
    const runAt = payload.runAt ? new Date(payload.runAt) : null;
    if (!runAt || Number.isNaN(runAt.getTime())) {
      throw new Error('A one-time schedule requires a valid runAt timestamp');
    }
    return runAt;
  }
  throw new Error('scheduleType must be "once" or "recurring"');
}

router.get('/', async (req, res) => {
  try {
    const schedules = await listSkillSchedules({
      userId: req.user.id,
      tenantId: req.user.tenantId,
    });
    res.json({ schedules });
  } catch (error) {
    logger.error('[skillSchedules] list error:', error);
    res.status(500).json({ error: 'Failed to list schedules' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body ?? {};
    if (!body.name || !body.prompt) {
      return res.status(400).json({ error: 'name and prompt are required' });
    }
    const nextRunAt = resolveScheduleTiming(body, new Date());
    const schedule = await createSkillSchedule({
      user: req.user.id,
      tenantId: req.user.tenantId,
      name: body.name,
      enabled: body.enabled !== false,
      prompt: body.prompt,
      skillName: body.skillName,
      skillId: body.skillId,
      agent_id: body.agent_id,
      endpoint: body.endpoint,
      endpointType: body.endpointType,
      model: body.model,
      spec: body.spec,
      scheduleType: body.scheduleType,
      cron: body.cron,
      runAt: body.runAt ? new Date(body.runAt) : undefined,
      timezone: body.timezone || 'UTC',
      nextRunAt,
    });
    res.status(201).json({ schedule });
  } catch (error) {
    logger.error('[skillSchedules] create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create schedule' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const schedule = await getSkillScheduleById(req.params.id, req.user.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json({ schedule });
  } catch (error) {
    logger.error('[skillSchedules] get error:', error);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await getSkillScheduleById(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    const body = req.body ?? {};
    const patch = {};
    for (const key of [
      'name',
      'enabled',
      'prompt',
      'skillName',
      'skillId',
      'agent_id',
      'endpoint',
      'endpointType',
      'model',
      'spec',
      'scheduleType',
      'cron',
      'timezone',
    ]) {
      if (body[key] !== undefined) {
        patch[key] = body[key];
      }
    }
    if (body.runAt !== undefined) {
      patch.runAt = body.runAt ? new Date(body.runAt) : undefined;
    }

    const timingChanged =
      patch.scheduleType !== undefined ||
      patch.cron !== undefined ||
      patch.runAt !== undefined ||
      patch.timezone !== undefined;
    if (timingChanged) {
      const merged = { ...existing, ...patch };
      patch.nextRunAt = resolveScheduleTiming(merged, new Date());
    }

    const schedule = await updateSkillSchedule(req.params.id, req.user.id, patch);
    res.json({ schedule });
  } catch (error) {
    logger.error('[skillSchedules] update error:', error);
    res.status(400).json({ error: error.message || 'Failed to update schedule' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteSkillSchedule(req.params.id, req.user.id);
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('[skillSchedules] delete error:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

/** Manual immediate run — shares the runner used by the poller. */
router.post('/:id/run', async (req, res) => {
  try {
    const schedule = await getSkillScheduleById(req.params.id, req.user.id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    const owner = await getUserById(req.user.id);
    if (!owner) {
      return res.status(404).json({ error: 'User not found' });
    }

    const conversationId = crypto.randomUUID();
    await markScheduleResult(schedule._id, { status: 'running', conversationId, error: null });

    /**
     * Fire-and-forget: an agent turn can take longer than the gateway's
     * request timeout (504). We respond immediately with the conversation id
     * and `running` status; the client polls `lastStatus` for completion.
     */
    runScheduleManually({ owner, schedule, conversationId }).catch((error) => {
      logger.error('[skillSchedules] background manual run error:', error);
    });

    res.status(202).json({ status: 'running', conversationId });
  } catch (error) {
    logger.error('[skillSchedules] manual run error:', error);
    res.status(500).json({ error: error.message || 'Failed to run schedule' });
  }
});

module.exports = router;
