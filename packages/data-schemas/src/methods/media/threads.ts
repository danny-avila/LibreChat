import type { MediaAsset, MediaThread, MediaTurn } from 'librechat-data-provider';
import type { FilterQuery } from 'mongoose';
import type {
  MediaAssetContent,
  MediaMethods,
  MediaStoredJob,
  MediaStoredThread,
  MediaStoredTurn,
} from '~/types/media';
import type { MediaPersistenceContext } from './context';
import {
  MediaPersistenceError,
  positiveMediaLimit as positive,
  mediaScopeFilter as scopeFilter,
  toMediaAsset,
} from '~/utils/media';
import { firstReadyAsset, jobView, readyAssetOutput, threadView } from './views';
import { cursorOf, cursorParts, durable, mediaDate, terminal } from './scope';

export function createMediaThreadsMethods({
  Thread,
  Job,
  Turn,
  File,
  mongoose,
}: Pick<MediaPersistenceContext, 'Thread' | 'Job' | 'Turn' | 'File' | 'mongoose'>): Pick<
  MediaPersistenceContext,
  | 'getMediaThread'
  | 'listMediaThreads'
  | 'pageTurnJobs'
  | 'listMediaTurnJobs'
  | 'listMediaTurns'
  | 'getMediaLatestImageContext'
  | 'replaceMediaThreadTitle'
  | 'updateMediaThread'
> {
  const getMediaThread: MediaMethods['getMediaThread'] = async (scope, threadId) => {
    const owner = scopeFilter(scope);
    const acceptedJobs = { ...owner, threadId, 'receipt.phase': 'accepted' };
    const [thread, pendingJobCount, turnCount, coverJob] = await Promise.all([
      Thread.findOne({ ...owner, threadId, status: 'active' }).lean(),
      Job.countDocuments({ ...acceptedJobs, phase: { $nin: terminal } }),
      Turn.countDocuments({ ...owner, threadId, publicationPhase: 'accepted' }),
      Job.findOne({ ...acceptedJobs, outputs: { $elemMatch: readyAssetOutput } })
        .sort({ createdAt: 1, jobId: 1 })
        .select({ outputs: 1 })
        .lean<Pick<MediaStoredJob, 'outputs'> | null>(),
    ]);
    if (!thread) {
      return null;
    }
    const cover =
      !thread.cover && !thread.coverExplicit ? firstReadyAsset(coverJob?.outputs) : undefined;
    if (pendingJobCount === thread.pendingJobCount && turnCount === thread.turnCount && !cover) {
      return threadView(thread);
    }
    // Job completion and its advisory projection are separate writes on standalone Mongo.
    // Opening a restored thread repairs an interrupted projection; repeated reads do not
    // change its version. The CAS protects title and cover edits made during this read.
    const repaired = await Thread.findOneAndUpdate(
      { ...owner, threadId, status: 'active', epoch: thread.epoch, version: thread.version },
      { $set: { pendingJobCount, turnCount, ...(cover ? { cover } : {}) }, $inc: { version: 1 } },
      { new: true, writeConcern: durable },
    ).lean();
    if (repaired) {
      return threadView(repaired);
    }
    const current = await Thread.findOne({ ...owner, threadId, status: 'active' }).lean();
    return current ? threadView(current) : null;
  };

  const listMediaThreads: MediaMethods['listMediaThreads'] = async ({
    scope,
    limit,
    cursor,
    filter,
    include,
    search,
  }) => {
    positive(limit);
    const after = cursorParts(cursor);
    // Temporary creations stay reachable by id but never appear in the library.
    const query: FilterQuery<MediaStoredThread> = {
      ...scopeFilter(scope),
      status: 'active',
      temporary: { $ne: true },
      $and: [
        { $or: [{ temporary: false }, { expiresAt: { $exists: false } }] },
        {
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
        },
      ],
    };
    if (search)
      query.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (after) {
      query.$or = [
        { createdAt: { $lt: mediaDate(after[0]) } },
        { createdAt: mediaDate(after[0]), threadId: { $lt: after[1] } },
      ];
    }
    if (include === 'activity') {
      type GalleryThread = MediaStoredThread & {
        jobs: Array<{ pending: number } & NonNullable<MediaThread['activity']>>;
        covers: Array<Pick<MediaStoredJob, 'outputs'>>;
      };
      const filtered = filter === 'pending' || filter === 'completed';
      const correlated = {
        ...scopeFilter(scope),
        'receipt.phase': 'accepted',
        $expr: { $eq: ['$threadId', '$$threadId'] },
      };
      const rows = await Thread.aggregate<GalleryThread>([
        { $match: query },
        { $sort: { createdAt: -1, threadId: -1 } },
        ...(!filtered ? [{ $limit: limit + 1 }] : []),
        {
          $lookup: {
            // eslint-disable-next-line no-restricted-syntax -- Owner and tenant are explicit in this correlated lookup.
            from: Job.collection.name,
            let: { threadId: '$threadId' },
            pipeline: [
              { $match: correlated },
              { $sort: { createdAt: -1, jobId: -1 } },
              {
                $group: {
                  _id: null,
                  pending: { $sum: { $cond: [{ $in: ['$phase', terminal] }, 0, 1] } },
                  latestJob: {
                    $first: {
                      phase: '$phase',
                      operation: '$operation',
                      selection: '$selection',
                    },
                  },
                  readyOutputs: {
                    $sum: {
                      $size: {
                        $filter: {
                          input: '$outputs',
                          as: 'output',
                          cond: {
                            $and: [
                              { $in: ['$$output.kind', ['image', 'video']] },
                              { $eq: ['$$output.state', 'ready'] },
                              { $ne: [{ $ifNull: ['$$output.asset.file_id', null] }, null] },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
              { $project: { _id: 0, pending: 1, latestJob: 1, readyOutputs: 1 } },
            ],
            as: 'jobs',
          },
        },
        {
          $lookup: {
            // eslint-disable-next-line no-restricted-syntax -- Owner and tenant are explicit in this correlated lookup.
            from: Job.collection.name,
            let: { threadId: '$threadId' },
            pipeline: [
              { $match: { ...correlated, outputs: { $elemMatch: readyAssetOutput } } },
              { $sort: { createdAt: 1, jobId: 1 } },
              { $limit: 1 },
              { $project: { _id: 0, outputs: 1 } },
            ],
            as: 'covers',
          },
        },
        ...(filtered
          ? [
              {
                $match:
                  filter === 'pending'
                    ? { 'jobs.pending': { $gt: 0 } }
                    : { 'jobs.readyOutputs': { $gt: 0 } },
              },
              { $limit: limit + 1 },
            ]
          : []),
      ]);
      const last = rows[limit - 1];
      return {
        items: rows.slice(0, limit).map((thread) => {
          const [projected] = thread.jobs;
          const cover =
            thread.cover ??
            (!thread.coverExplicit ? firstReadyAsset(thread.covers[0]?.outputs) : undefined);
          return {
            ...threadView({ ...thread, cover }),
            pendingJobCount: projected?.pending ?? 0,
            activity: projected
              ? { latestJob: projected.latestJob, readyOutputs: projected.readyOutputs }
              : { readyOutputs: 0 },
          };
        }),
        ...(rows.length > limit && last
          ? { nextCursor: cursorOf(last.createdAt, last.threadId) }
          : {}),
      };
    }
    if (filter === 'pending') {
      query.pendingJobCount = { $gt: 0 };
    }
    if (filter === 'completed') {
      query.pendingJobCount = 0;
      query.turnCount = { $gt: 0 };
    }
    const rows = await Thread.find(query)
      .sort({ createdAt: -1, threadId: -1 })
      .limit(limit + 1)
      .lean();
    const last = rows[limit - 1];
    return {
      items: rows.slice(0, limit).map(threadView),
      ...(rows.length > limit && last
        ? { nextCursor: cursorOf(last.createdAt, last.threadId) }
        : {}),
    };
  };

  const pageTurnJobs: MediaMethods['listMediaTurnJobs'] = async ({
    scope,
    turnId,
    limit,
    cursor,
  }) => {
    positive(limit);
    const after = cursorParts(cursor);
    const query: FilterQuery<MediaStoredJob> = {
      ...scopeFilter(scope),
      turnId,
      'receipt.phase': 'accepted',
    };
    if (after) {
      query.$or = [
        { createdAt: { $gt: mediaDate(after[0]) } },
        { createdAt: mediaDate(after[0]), jobId: { $gt: after[1] } },
      ];
    }
    const rows = await Job.find(query)
      .sort({ createdAt: 1, jobId: 1 })
      .limit(limit + 1)
      .lean<MediaStoredJob[]>();
    const last = rows[limit - 1];
    return {
      items: rows.slice(0, limit).map(jobView),
      ...(rows.length > limit && last ? { nextCursor: cursorOf(last.createdAt, last.jobId) } : {}),
    };
  };

  const listMediaTurnJobs: MediaMethods['listMediaTurnJobs'] = async (input) => {
    const turn = await Turn.findOne({
      ...scopeFilter(input.scope),
      turnId: input.turnId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    })
      .select({ threadId: 1 })
      .lean();
    if (
      !turn ||
      !(await Thread.exists({
        ...scopeFilter(input.scope),
        threadId: turn.threadId,
        status: 'active',
      }))
    ) {
      return { items: [] };
    }
    return pageTurnJobs(input);
  };

  const listMediaTurns: MediaMethods['listMediaTurns'] = async ({
    scope,
    threadId,
    limit,
    cursor,
    jobsPerTurn,
  }) => {
    positive(limit);
    positive(jobsPerTurn);
    const owner = scopeFilter(scope);
    const after = cursorParts(cursor);
    const query: FilterQuery<MediaStoredTurn> = {
      ...owner,
      threadId,
      publicationPhase: 'accepted',
    };
    if (after) {
      const sequence = Number(after[0]);
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new MediaPersistenceError('invalid_input', 'Invalid media turn cursor');
      }
      query.sequence = { $lt: sequence };
    }
    const [activeThread, rows] = await Promise.all([
      Thread.exists({ ...owner, threadId, status: 'active' }),
      Turn.find(query)
        .sort({ sequence: -1 })
        .limit(limit + 1)
        .lean<MediaStoredTurn[]>(),
    ]);
    if (!activeThread) {
      return { items: [] };
    }
    const page = rows.slice(0, limit);
    if (!page.length) {
      return { items: [] };
    }
    const importIds = [
      ...new Set(
        page
          .filter((turn) => turn.kind === 'import')
          .flatMap((turn) => turn.inputs.map((input) => input.file_id)),
      ),
    ];
    const [jobRowsByTurn, importFiles] = await Promise.all([
      Job.find({
        ...scopeFilter(scope),
        turnId: { $in: page.map((turn) => turn.turnId) },
        'receipt.phase': 'accepted',
      })
        .sort({ createdAt: 1, jobId: 1 })
        .lean<MediaStoredJob[]>()
        .then((jobs) =>
          jobs.reduce((groups, job) => {
            const group = groups.get(job.turnId);
            if (!group) {
              groups.set(job.turnId, [job]);
            } else if (group.length <= jobsPerTurn) {
              group.push(job);
            }
            return groups;
          }, new Map<string, MediaStoredJob[]>()),
        ),
      importIds.length
        ? File.find({
            user: scope.ownerId,
            tenantId: scope.tenantId,
            file_id: { $in: importIds },
            mediaLifecycle: 'live',
          }).lean()
        : Promise.resolve([]),
    ]);
    const assetsById = new Map(importFiles.map((file) => [file.file_id, toMediaAsset(file)]));
    const items = page.map((turn): MediaTurn => {
      const jobRows = jobRowsByTurn.get(turn.turnId) ?? [];
      const lastJob = jobRows[jobsPerTurn - 1];
      const jobs = {
        items: jobRows.slice(0, jobsPerTurn).map(jobView),
        nextCursor:
          jobRows.length > jobsPerTurn && lastJob
            ? cursorOf(lastJob.createdAt, lastJob.jobId)
            : undefined,
      };
      const assets =
        turn.kind === 'import'
          ? turn.inputs
              .map((file) => assetsById.get(file.file_id))
              .filter((asset): asset is MediaAsset => asset !== undefined)
          : [];
      return {
        schemaVersion: 1,
        threadId,
        turnId: turn.turnId,
        version: turn.version,
        kind: turn.kind,
        sequence: turn.sequence,
        createdAt: turn.createdAt.toISOString(),
        prompt: turn.prompt,
        parentTurnId: turn.parentTurnId,
        ...(turn.comparisonId ? { comparisonId: turn.comparisonId } : {}),
        inputs: turn.inputs,
        selection: turn.selection,
        operation: turn.operation,
        ...(jobRows[0] ? { parameters: jobRows[0].request.parameters } : {}),
        jobs: jobs.items,
        jobsNextCursor: jobs.nextCursor,
        assets,
      };
    });
    const last = rows[limit - 1];
    return {
      items,
      ...(rows.length > limit && last
        ? { nextCursor: cursorOf(String(last.sequence), last.turnId) }
        : {}),
    };
  };

  const getMediaLatestImageContext: MediaMethods['getMediaLatestImageContext'] = async ({
    scope: inputScope,
    threadId,
  }) => {
    const scope = scopeFilter(inputScope);
    const liveFile = {
      user: new mongoose.Types.ObjectId(scope.ownerId),
      tenantId: scope.tenantId,
      mediaLifecycle: 'live',
      type: /^image\//,
      $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
    };
    const [context] = await Thread.aggregate<{ turnId: string; file: MediaAssetContent }>([
      { $match: { ...scope, threadId, status: 'active' } },
      {
        $lookup: {
          // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
          from: Turn.collection.name,
          let: { threadId: '$threadId' },
          pipeline: [
            {
              $match: {
                ...scope,
                publicationPhase: 'accepted',
                $expr: { $eq: ['$threadId', '$$threadId'] },
              },
            },
            { $sort: { sequence: -1 } },
            {
              $lookup: {
                // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
                from: Job.collection.name,
                let: { turnId: '$turnId' },
                pipeline: [
                  {
                    $match: {
                      ...scope,
                      phase: 'succeeded',
                      'receipt.phase': 'accepted',
                      $expr: { $eq: ['$turnId', '$$turnId'] },
                    },
                  },
                  { $unwind: '$outputs' },
                  {
                    $match: {
                      'outputs.kind': 'image',
                      'outputs.state': 'ready',
                      'outputs.asset.file_id': { $exists: true },
                    },
                  },
                  { $sort: { createdAt: -1, jobId: -1, 'outputs.ordinal': 1 } },
                  {
                    $lookup: {
                      // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
                      from: File.collection.name,
                      let: { fileId: '$outputs.asset.file_id' },
                      pipeline: [
                        { $match: { ...liveFile, $expr: { $eq: ['$file_id', '$$fileId'] } } },
                        { $limit: 1 },
                      ],
                      as: 'file',
                    },
                  },
                  { $unwind: '$file' },
                  { $limit: 1 },
                  { $project: { _id: 0, file: 1 } },
                ],
                as: 'images',
              },
            },
            {
              $lookup: {
                // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
                from: File.collection.name,
                let: { fileIds: '$inputs.file_id', kind: '$kind' },
                pipeline: [
                  {
                    $match: {
                      ...liveFile,
                      $expr: {
                        $and: [{ $eq: ['$$kind', 'import'] }, { $in: ['$file_id', '$$fileIds'] }],
                      },
                    },
                  },
                  { $addFields: { inputOrder: { $indexOfArray: ['$$fileIds', '$file_id'] } } },
                  { $sort: { inputOrder: 1 } },
                  { $limit: 1 },
                ],
                as: 'imports',
              },
            },
            {
              $addFields: {
                file: {
                  $ifNull: [
                    { $arrayElemAt: ['$images.file', 0] },
                    { $arrayElemAt: ['$imports', 0] },
                  ],
                },
              },
            },
            { $match: { file: { $ne: null } } },
            { $limit: 1 },
            { $project: { _id: 0, turnId: 1, file: 1 } },
          ],
          as: 'context',
        },
      },
      { $unwind: '$context' },
      { $replaceRoot: { newRoot: '$context' } },
    ]);
    return context ? { turnId: context.turnId, asset: toMediaAsset(context.file) } : null;
  };

  const replaceMediaThreadTitle: MediaMethods['replaceMediaThreadTitle'] = async (input) => {
    const result = await Thread.updateOne(
      {
        ...scopeFilter(input.scope),
        threadId: input.threadId,
        status: 'active',
        title: input.expectedTitle,
      },
      { $set: { title: input.title }, $inc: { version: 1 } },
      { writeConcern: durable },
    );
    return result.matchedCount > 0;
  };

  const updateMediaThread: MediaMethods['updateMediaThread'] = async (input) => {
    const set: Record<string, unknown> = {};
    if (input.title !== undefined) {
      set.title = input.title;
    }
    if (input.coverFileId) {
      const thread = await Thread.findOne({
        ...scopeFilter(input.scope),
        threadId: input.threadId,
        status: 'active',
        version: input.expectedVersion,
      })
        .select({ epoch: 1 })
        .lean();
      if (!thread) {
        return null;
      }
      const cover = await File.findOne({
        user: input.scope.ownerId,
        tenantId: input.scope.tenantId,
        file_id: input.coverFileId,
        mediaLifecycle: 'live',
        mediaRetainers: `thread:${input.threadId}:${thread.epoch}`,
        $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
      }).lean();
      if (!cover) {
        throw new MediaPersistenceError(
          'not_found',
          'A cover must be retained by this media thread',
        );
      }
      set.cover = toMediaAsset(cover);
    }
    if (input.coverFileId !== undefined) {
      set.coverExplicit = true;
    }
    const row = await Thread.findOneAndUpdate(
      {
        ...scopeFilter(input.scope),
        threadId: input.threadId,
        status: 'active',
        version: input.expectedVersion,
      },
      {
        $set: set,
        $inc: { version: 1 },
        ...(input.coverFileId === null ? { $unset: { cover: 1 } } : {}),
      },
      { new: true, writeConcern: durable },
    ).lean();
    return row ? threadView(row) : null;
  };
  return {
    getMediaThread,
    listMediaThreads,
    pageTurnJobs,
    listMediaTurnJobs,
    listMediaTurns,
    getMediaLatestImageContext,
    replaceMediaThreadTitle,
    updateMediaThread,
  };
}
