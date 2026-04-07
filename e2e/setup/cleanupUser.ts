import { connectDb } from '@librechat/backend/db/connect';
import {
  findUser,
  deleteConvos,
  deleteMessages,
  deleteAllUserSessions,
} from '@librechat/backend/models';
import { User, Balance, Transaction, AclEntry, Token, Group } from '@librechat/backend/db/models';

type TUser = { email: string; password: string };

export default async function cleanupUser(user: TUser) {
  const { email } = user;
  try {
    console.log('🤖: global teardown has been started');
    const db = await connectDb();
    console.log('🤖:  ✅  Connected to Database');

    const foundUser = await findUser({ email });
    if (!foundUser) {
      console.log('🤖:  ⚠️  User not found in Database');
      return;
    }

    const userId = foundUser._id;
    console.log('🤖:  ✅  Found user in Database');

    // Delete all conversations & associated messages
    try {
      const { deletedCount, messages } = await deleteConvos(userId, {});

      if (messages.deletedCount > 0 || deletedCount > 0) {
        console.log(`🤖:  ✅  Deleted ${deletedCount} convos & ${messages.deletedCount} messages`);
      }
    } catch (error) {
      // No conversations to delete - this is fine
      console.log('🤖:  ℹ️  No conversations to delete');
    }

    // Ensure all user messages are deleted
    const { deletedCount: deletedMessages } = await deleteMessages({ user: userId });
    if (deletedMessages > 0) {
      console.log(`🤖:  ✅  Deleted ${deletedMessages} remaining message(s)`);
    }

    // Delete all user sessions
    await deleteAllUserSessions(userId.toString());

    // Delete user, balance, transactions, tokens, ACL entries, and remove from groups
    await Balance.deleteMany({ user: userId });
    await Transaction.deleteMany({ user: userId });
    await Token.deleteMany({ userId: userId });
    await AclEntry.deleteMany({ principalId: userId });
    const userIdStr = userId.toString();
    await Group.updateMany({ memberIds: userIdStr }, { $pullAll: { memberIds: [userIdStr] } });
    await User.deleteMany({ _id: userId });

    console.log('🤖:  ✅  Deleted user from Database');

    await db.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
