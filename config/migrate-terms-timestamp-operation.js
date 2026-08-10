/**
 * Backfills terms timestamps under one authority mutation and invalidates the
 * shared authentication-user cache after the new generation is published.
 *
 * @param {{
 *   users: AsyncIterable<{ _id: object | string, createdAt?: Date | null }>,
 *   userModel: { updateOne: Function },
 *   authority: { mutateMCPAuthority: Function },
 *   authUserCache: { clear: Function },
 *   now?: () => Date,
 *   onMissingCreatedAt?: (userId: string) => void,
 *   onProgress?: (migratedCount: number) => void,
 * }} dependencies
 */
async function migrateTermsTimestamps({
  users,
  userModel,
  authority,
  authUserCache,
  now = () => new Date(),
  onMissingCreatedAt = () => {},
  onProgress = () => {},
}) {
  const { result } = await authority.mutateMCPAuthority(async () => {
    let migratedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for await (const user of users) {
      const userId = String(user._id);
      try {
        const termsAcceptedAt = user.createdAt ?? now();
        if (user.createdAt == null) {
          onMissingCreatedAt(userId);
        }
        const updateResult = await userModel.updateOne(
          {
            _id: user._id,
            termsAccepted: true,
            $or: [{ termsAcceptedAt: null }, { termsAcceptedAt: { $exists: false } }],
          },
          { $set: { termsAcceptedAt } },
        );

        if (updateResult.modifiedCount === 0) {
          skippedCount++;
          continue;
        }
        migratedCount++;
        onProgress(migratedCount);
      } catch (error) {
        errors.push({ userId, error });
      }
    }

    return { migratedCount, skippedCount, errors };
  });

  await authUserCache.clear();
  return result;
}

module.exports = migrateTermsTimestamps;
