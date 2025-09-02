// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require('bcryptjs');
import { FilterQuery } from 'mongoose';
// workaround generic type issues

// Lazy require to leverage existing model aliases from LibreChat core
const { User, Balance, Key } = require('~/db/models');

/**
 * List users with optional search and pagination.
 */
export async function listUsers({
  page = 1,
  limit = 20,
  search,
}: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  const query: FilterQuery<any> = {};
  if (search) {
    // Simple case-insensitive search on email or name
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  // Fetch users first
  const [users, total] = await Promise.all([
    User.find(query, '-password -totpSecret').skip(skip).limit(limit).lean(),
    User.countDocuments(query),
  ]);

  // Append tokenCredits for each user by looking up balances in bulk
  if (users.length > 0) {
    const balances = await Balance.find({ user: { $in: users.map((u: any) => u._id) } }, 'user tokenCredits').lean();
    const balMap = new Map<string, number>();
    balances.forEach((b: any) => {
      balMap.set(String(b.user), b.tokenCredits ?? 0);
    });
    users.forEach((u: any) => {
      u.tokenCredits = balMap.get(String(u._id)) ?? 0;
    });
  }

  return { users, total, page, limit };
}

/**
 * Retrieve a single user (sanitised).
 */
export async function getUser(id: string) {
  return User.findById(id, '-password -totpSecret').lean();
}

/**
 * Create a new user as ADMIN. Marks emailVerified true by default and allows explicit role.
 * Temporary for testing with multiple users. In the future only through signup.
 */
export async function createUser({
  email,
  password,
  role = 'USER',
  name,
  username,
}: {
  email: string;
  password: string;
  role?: string;
  name?: string;
  username?: string;
}) {
  const salt = bcrypt.genSaltSync(10);
  const hashed = bcrypt.hashSync(password, salt);
  const doc = await User.create({
    provider: 'local',
    email,
    password: hashed,
    role,
    name,
    username,
    emailVerified: true,
  });
  return doc.toObject();
}

/**
 * Patch a user document. Do NOT allow direct password change – expect hashed.
 */
export async function updateUserById(id: string, patch: Record<string, unknown>) {
  return User.findByIdAndUpdate(id, patch, { new: true }).lean();
}

/**
 * Delete user and related collections (Balance, Keys). Minimal for now.
 */
export async function deleteUserCompletely(id: string) {
  await Promise.all([
    User.findByIdAndDelete(id),
    Balance.deleteMany({ user: id }),
    Key.deleteMany({ userId: id }),
  ]);
}

/**
 * Balance helpers
 */
export async function getUserBalance(id: string) {
  const balance = await Balance.findOne({ user: id }, '-_id -__v').lean();
  // If no balance record exists, return a default object with zero credits
  if (!balance) {
    return { tokenCredits: 0 } as any;
  }
  return balance;
}

export async function updateUserBalance(id: string, patch: Record<string, unknown>) {
  // Use upsert so a balance document is created if it does not yet exist for the user
  return Balance.findOneAndUpdate({ user: id }, patch, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  }).lean();
}

/**
 * Aggregate simple statistics for dashboard cards.
 */
export async function getUserStats() {
  const [total, admins, recent] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: 'ADMIN' }),
    User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
  ]);

  return {
    totalUsers: total,
    adminUsers: admins,
    recentUsers: recent,
  };
} 