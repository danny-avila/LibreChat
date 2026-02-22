import synthesisRunSchema from '~/schema/synthesisRun';
import type { ISynthesisRun } from '~/types/synthesisRun';

export function createSynthesisRunModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.SynthesisRun || mongoose.model<ISynthesisRun>('SynthesisRun', synthesisRunSchema);
}
