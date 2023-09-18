import connectDb from '@librechat/backend/lib/db/connectDb';
import User from '@librechat/backend/models/User';
import Session from '@librechat/backend/models/Session';
import { deleteMessages } from '@librechat/backend/models/Message';
import { deleteConvos } from '@librechat/backend/models/Conversation';
type TUser = { email: string; password: string };

export default async function cleanupUser(user: TUser) {
  const { email } = user;
  try {
    console.log('🤖: global teardown has been started');
    const db = await connectDb();
    console.log('🤖:  ✅  Connected to Database');

    const { _id } = await User.findOne({ email }).lean();
    console.log('🤖:  ✅  Found user in Database');

    // Delete all conversations & associated messages
    const { deletedCount, messages } = await deleteConvos(_id, {});

    if (messages.deletedCount > 0 || deletedCount > 0) {
      console.log(`🤖:  ✅  Deleted ${deletedCount} convos & ${messages.deletedCount} messages`);
    }

    // Ensure all user messages are deleted
    const { deletedCount: deletedMessages } = await deleteMessages({ user: _id });
    if (deletedMessages > 0) {
      console.log(`🤖:  ✅  Deleted ${deletedMessages} remaining message(s)`);
    }

    await Session.deleteAllUserSessions(_id);

    await User.deleteMany({ email });

    console.log('🤖:  ✅  Deleted user from Database');

    await db.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
