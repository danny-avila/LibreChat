import 'dotenv/config';
import mongoose from 'mongoose';
import { migrateConversationTags } from '@librechat/data-schemas';

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--dry-run', '--apply'].includes(args[0])) {
    throw new Error('Usage: npm run migrate:conversation-tags -- --dry-run|--apply');
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const result = await migrateConversationTags(mongoose.connection, {
      dryRun: args[0] === '--dry-run',
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
