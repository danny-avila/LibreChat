/* eslint-disable no-undef */

/**
 * Get the number of users who have ever logged in broken down by their email-domain.
 */
print(
  [
    'emailDomain,userCount',
    ...db.users
      .aggregate([
        { $group: { _id: { $arrayElemAt: [{ $split: ['$email', '@'] }, 1] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray()
      .map((d) => `${d._id},${d.count}`),
  ].join('\n'),
);

/**
 * Get the number of users who sent at least one chat over the course of a specified week.
 */
(function () {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const WEEK_START = ISODate('2026-06-14T00:00:00Z'); // TODO: Replace with a specific Sunday-date
  const WEEK_END = new Date(WEEK_START.getTime() + 7 * MS_PER_DAY);

  const domainByUser = {};
  db.users.find({}, { _id: 1, email: 1 }).forEach((u) => {
    domainByUser[String(u._id)] = (u.email ?? '').split('@')[1] ?? '(none)';
  });

  const activeUsers = db.messages.distinct('user', {
    isCreatedByUser: true,
    createdAt: { $gte: WEEK_START, $lt: WEEK_END },
  });

  const domainCounts = {};
  for (const user of activeUsers) {
    const domain = domainByUser[String(user)] ?? '(unknown)';
    domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
  }

  const label = WEEK_START.toISOString().slice(0, 10);
  print(`// weekOf ${label} (UTC, Sun–Sat): ${activeUsers.length} distinct active users`);
  print(
    [
      'weekOf,domain,activeUsers',
      ...Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([domain, count]) => `${label},${domain},${count}`),
    ].join('\n'),
  );
})();
