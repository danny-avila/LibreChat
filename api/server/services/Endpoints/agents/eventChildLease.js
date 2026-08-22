const { GenerationJobManager, createEventChildGenerationLeaseAcquirer } = require('@librechat/api');
const {
  acquireSubagentThreadLease,
  renewSubagentThreadLease,
  releaseSubagentThreadLease,
} = require('~/models');

const acquireEventChildGenerationLease = createEventChildGenerationLeaseAcquirer({
  methods: {
    acquireSubagentThreadLease,
    renewSubagentThreadLease,
    releaseSubagentThreadLease,
  },
  abortGeneration: (streamId, options) => GenerationJobManager.abortJob(streamId, options),
});

module.exports = { acquireEventChildGenerationLease };
