/* global db */

const database = db.getSiblingDB('LibreChat');
const marker = database.migration_probe.findOne({ _id: 'preserved' });
if (marker?.value !== 42) {
  throw new Error('Existing MongoDB data was not preserved');
}

const session = db.getMongo().startSession();
try {
  session.startTransaction({
    readPreference: { mode: 'primary' },
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  const transactionalMarker = session
    .getDatabase('LibreChat')
    .migration_probe.findOne({ _id: 'preserved' });
  if (transactionalMarker?.value !== 42) {
    throw new Error('Snapshot transaction could not read the preserved data');
  }
  session.commitTransaction();
} catch (error) {
  try {
    session.abortTransaction();
  } catch {
    /** The verification already failed. */
  }
  throw error;
} finally {
  session.endSession();
}

print('Existing data and snapshot transaction verified');
