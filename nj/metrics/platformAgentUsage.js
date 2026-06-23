/* eslint-disable no-undef */

/**
 * This query assumes all Platform Agents were created by the AGENT_CREATOR user.
 */
(function () {
  const AGENT_CREATOR = ObjectId('69713834a110f6e6ba6b51d2');

  const nameById = {};
  const ids = [];
  db.agents.find({ author: AGENT_CREATOR }, { id: 1, name: 1, _id: 0 }).forEach((a) => {
    nameById[a.id] = a.name;
    ids.push(a.id);
  });

  print(
    [
      'agent_id,name,conversations,distinctUsers',
      ...db.conversations
        .aggregate([
          { $match: { agent_id: { $in: ids } } },
          { $group: { _id: '$agent_id', convs: { $sum: 1 }, users: { $addToSet: '$user' } } },
          { $sort: { convs: -1 } },
        ])
        .toArray()
        .map((d) => `${d._id},${nameById[d._id] ?? '?'},${d.convs},${d.users.length}`),
    ].join('\n'),
  );
})();

/**
 * Find the AGENT_CREATOR user (the Production User ID is already hard-coded above).
 */
db.users.find({ email: { $eq: '<TODO--REPLACE-WITH-USER-EMAIL>' } }, { _id: 1, name: 1, email: 1 });
