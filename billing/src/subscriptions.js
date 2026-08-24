import { Subscription } from './db.js';

// Returns the user's subscription or null; `active` is computed, expired
// records are kept so the UI can show "expired on <date>".
export async function getSubscription(userId) {
  const sub = await Subscription.findOne({ user: userId }).lean();
  if (!sub) return null;
  return { ...sub, active: sub.expiresAt > new Date() };
}

// Grants `days` of the given tariff. An active subscription is extended from
// its current expiry; an expired or missing one starts counting from now.
// Switching tariffs replaces the tariff but keeps accumulated time.
export async function grantSubscription(userId, tariff, days, source = 'payment') {
  const now = new Date();
  const current = await Subscription.findOne({ user: userId });
  const base = current && current.expiresAt > now ? current.expiresAt : now;
  const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const sub = await Subscription.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        tariff: { id: tariff._id ?? tariff.id, title: tariff.title },
        expiresAt,
        source,
      },
      $setOnInsert: { startsAt: now },
    },
    { upsert: true, new: true },
  ).lean();
  console.log(`[billing] subscription for ${userId}: «${tariff.title}» until ${expiresAt.toISOString()}`);
  return sub;
}

// Refund: takes the tariff's period back from the subscription.
export async function revokeSubscriptionDays(userId, days) {
  const sub = await Subscription.findOne({ user: userId });
  if (!sub) return null;
  sub.expiresAt = new Date(sub.expiresAt.getTime() - days * 24 * 60 * 60 * 1000);
  await sub.save();
  console.log(`[billing] revoked ${days}d from ${userId}: now until ${sub.expiresAt.toISOString()}`);
  return sub.toObject();
}
