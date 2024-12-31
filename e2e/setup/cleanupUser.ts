import connectDb from '@librechat/backend/lib/db/connectDb';
import {
  deleteMessages,
  deleteConvos,
  User,
  deleteAllUserSessions,
  Balance,
} from '@librechat/backend/models';
import { Transaction } from '@librechat/backend/models/Transaction';
type TUser = { email: string; password: string };

export default async function cleanupUser(user: TUser) {
  const { email } = user;
  try {
    console.log('🤖: global teardown has been started');
    const db = await connectDb();
    console.log('🤖:  ✅  Connected to Database');

    const { _id: user } = await User.findOne({ email }).lean();
    console.log('🤖:  ✅  Found user in Database');

    // Delete all conversations & associated messages
    const { deletedCount, messages } = await deleteConvos(user, {});

    if (messages.deletedCount > 0 || deletedCount > 0) {
      console.log(`🤖:  ✅  Deleted ${deletedCount} convos & ${messages.deletedCount} messages`);
    }

    // Ensure all user messages are deleted
    const { deletedCount: deletedMessages } = await deleteMessages({ user });
    if (deletedMessages > 0) {
      console.log(`🤖:  ✅  Deleted ${deletedMessages} remaining message(s)`);
    }

    // TODO: fix this to delete all user sessions with the user's email
    await deleteAllUserSessions(user);

    await User.deleteMany({ _id: user });
    await Balance.deleteMany({ user });
    await Transaction.deleteMany({ user });

    console.log('🤖:  ✅  Deleted user from Database');

    await db.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
