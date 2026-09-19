import type { TMediaInsights, TMediaInsightsTotals } from 'librechat-data-provider';
import type { PipelineStage } from 'mongoose';

type MediaInsightsOptions = {
  tenantId?: string;
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
};

const emptyTotals = (): TMediaInsightsTotals => ({
  submitted: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  uncertain: 0,
  active: 0,
  providerCostUSD: 0,
  operatorCostUSD: 0,
  estimatedCostUSD: 0,
  unclassifiedCostUSD: 0,
  unknownCostJobs: 0,
});

/** Reads the shared financial receipt, never provider estimates or message token counters. */
export async function getMediaInsights(
  mongoose: typeof import('mongoose'),
  options: MediaInsightsOptions,
): Promise<TMediaInsights> {
  const page = Math.max(1, Math.floor(options.page));
  const pageSize = Math.min(50, Math.max(5, Math.floor(options.pageSize)));
  const countPhase = (phase: string) => ({ $sum: { $cond: [{ $eq: ['$phase', phase] }, 1, 0] } });
  const cost = (source: string) => ({
    $sum: {
      $cond: [
        {
          $and: [
            { $eq: ['$receiptCost.mediaCostSource', source] },
            { $ne: ['$operatorSettlement', true] },
          ],
        },
        { $ifNull: ['$receiptCost.mediaCostUSD', 0] },
        0,
      ],
    },
  });
  const totals = {
    submitted: { $sum: 1 },
    completed: countPhase('succeeded'),
    failed: countPhase('failed'),
    cancelled: countPhase('cancelled'),
    uncertain: countPhase('requires_attention'),
    active: {
      $sum: {
        $cond: [
          { $in: ['$phase', ['queued', 'submitting', 'running', 'ingesting', 'reconciling']] },
          1,
          0,
        ],
      },
    },
    providerCostUSD: cost('provider'),
    estimatedCostUSD: cost('estimate'),
    operatorCostUSD: {
      $sum: { $cond: ['$operatorSettlement', { $ifNull: ['$receiptCost.mediaCostUSD', 0] }, 0] },
    },
    unclassifiedCostUSD: {
      $sum: {
        $cond: [
          {
            $or: [
              '$operatorSettlement',
              { $in: ['$receiptCost.mediaCostSource', ['provider', 'estimate']] },
            ],
          },
          0,
          { $ifNull: ['$receiptCost.mediaCostUSD', 0] },
        ],
      },
    },
    unknownCostJobs: {
      $sum: {
        $cond: [
          {
            $and: [
              { $ne: ['$provider.certainty', 'unsubmitted'] },
              { $eq: [{ $ifNull: ['$receiptCost.mediaCostUSD', null] }, null] },
            ],
          },
          1,
          0,
        ],
      },
    },
  };
  const pipeline: PipelineStage[] = [
    {
      $match: {
        tenantId: options.tenantId ?? null,
        executionOwner: 'media',
        'receipt.phase': 'accepted',
        createdAt: { $gte: options.from.toISOString(), $lte: options.to.toISOString() },
      },
    },
    {
      $lookup: {
        from: 'transactions',
        let: { job: '$jobId', owner: '$ownerId', tenant: '$tenantId' },
        pipeline: [
          {
            $match: {
              context: 'media',
              $expr: {
                $and: [
                  { $eq: ['$mediaJobId', '$$job'] },
                  { $eq: [{ $toString: '$user' }, '$$owner'] },
                  { $eq: [{ $ifNull: ['$tenantId', null] }, '$$tenant'] },
                ],
              },
            },
          },
          { $project: { _id: 0, mediaCostUSD: 1, mediaCostSource: 1 } },
          { $limit: 1 },
        ],
        as: 'costs',
      },
    },
    {
      $set: {
        receiptCost: { $arrayElemAt: ['$costs', 0] },
        operatorSettlement: {
          $in: ['settle', { $ifNull: ['$recoveryDecisions.request.action', []] }],
        },
      },
    },
    {
      $facet: {
        summary: [{ $group: { _id: null, ...totals } }, { $project: { _id: 0 } }],
        offerings: [
          {
            $group: {
              _id: {
                provider: '$execution.api',
                model: '$execution.modelId',
                operation: '$operation',
              },
              ...totals,
            },
          },
          { $sort: { submitted: -1, '_id.provider': 1, '_id.model': 1, '_id.operation': 1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          { $replaceWith: { $mergeObjects: ['$$ROOT', '$_id'] } },
          { $project: { _id: 0 } },
        ],
        offeringCount: [
          { $group: { _id: ['$execution.api', '$execution.modelId', '$operation'] } },
          { $count: 'total' },
        ],
      },
    },
  ];
  const [result] = await mongoose.models.MediaJob.aggregate<{
    summary: TMediaInsightsTotals[];
    offerings: TMediaInsights['offerings'];
    offeringCount: Array<{ total: number }>;
  }>(pipeline);
  return {
    summary: result?.summary[0] ?? emptyTotals(),
    offerings: result?.offerings ?? [],
    page,
    pageSize,
    pages: Math.max(1, Math.ceil((result?.offeringCount[0]?.total ?? 0) / pageSize)),
  };
}
