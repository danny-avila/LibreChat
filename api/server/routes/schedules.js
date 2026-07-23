const express = require('express');
const { Permissions, PermissionTypes } = require('librechat-data-provider');
const { createSchedulesHandlers, generateCheckAccess } = require('@librechat/api');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const {
  getLimits,
  fireScheduleNow,
  deleteScheduleForOwner,
} = require('~/server/services/Schedules');
const { resolveAgentFireAccess } = require('~/server/services/Schedules/access');
const methods = require('~/models');

const { getRoleByName } = methods;

const router = express.Router();
router.use(requireJwtAuth);
router.use(configMiddleware);

const checkSchedulesAccess = generateCheckAccess({
  permissionType: PermissionTypes.SCHEDULES,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkSchedulesCreate = generateCheckAccess({
  permissionType: PermissionTypes.SCHEDULES,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

const handlers = createSchedulesHandlers({
  methods,
  getLimits,
  // Full fire-equivalent access check (not mere existence): the body-based agent
  // middleware is a no-op for schedule payloads (no `endpoint: 'agents'`), so
  // enforce the same role AGENTS:USE + resource VIEW (with manage:agents bypass)
  // the actual fire requires — otherwise a role without AGENTS:USE could schedule
  // runs the chat route rejects and walks toward auto-disable.
  canViewAgent: async (agentId, req) => (await resolveAgentFireAccess(agentId, req.user)) === 'ok',
  filterOwnedFileIds: async (fileIds, userId) => {
    const files = await methods.getFiles({ file_id: { $in: fileIds }, user: userId }, null, {
      file_id: 1,
    });
    return (files ?? []).map((file) => file.file_id);
  },
  markFilesUsed: async (fileIds, userId) => {
    // Verify EVERY requested file was actually marked used (TTL cleared). A file can
    // be deleted/expire between the ownership check and here; updateFilesUsage then
    // returns fewer docs without throwing, and a silent success would persist a
    // schedule whose attachments the first fire drops. Throw so retainFiles retries /
    // fails, rather than committing a schedule with unretained files.
    const requested = new Set(fileIds).size;
    // updateFilesUsage dedupes and returns only the docs it actually updated.
    const updated = await methods.updateFilesUsage(
      fileIds.map((file_id) => ({ file_id })),
      undefined,
      { user: userId },
    );
    const cleared = Array.isArray(updated) ? updated.length : 0;
    if (cleared !== requested) {
      throw new Error(`attachment retention incomplete: ${cleared}/${requested} files marked used`);
    }
  },
  fireNow: fireScheduleNow,
  // Quiesce-then-erase delete: stops new claims, aborts in-flight loopback runs,
  // and erases once drained (reconciler completes drain) so evidence is preserved.
  deleteSchedule: deleteScheduleForOwner,
  // Durable account-deletion barrier. A one-shot disable scan cannot close the
  // create race, so every scheduling WRITE consults the user-level flag instead.
  isUserDeleting: methods.isUserDeleting,
});

router.get('/', checkSchedulesAccess, handlers.listSchedules);
router.get('/:id', checkSchedulesAccess, handlers.getSchedule);
router.post('/', checkSchedulesCreate, handlers.createSchedule);
router.patch('/:id', checkSchedulesCreate, handlers.updateSchedule);
router.delete('/:id', checkSchedulesCreate, handlers.deleteSchedule);
// Run-now mutates runtime state; gate it on CREATE like the UI does (not USE).
router.post('/:id/run', checkSchedulesCreate, handlers.runScheduleNow);

module.exports = router;
