/* eslint-disable no-undef */
(function () {
  const AGENTS_LAUNCH_DATE = ISODate('2026-06-25T00:00:00Z');
  const total = db.conversations.countDocuments({ updatedAt: { $gte: AGENTS_LAUNCH_DATE } });
  const withAgent = db.conversations.countDocuments({
    updatedAt: { $gte: AGENTS_LAUNCH_DATE },
    agent_id: { $regex: /^agent_/ }, // Filter out ephemeral agents
  });
  const percentage = total ? ((100 * withAgent) / total).toFixed(1) : '0';
  print('startingDate,totalConversations,withAgent,percentage');
  print(`${AGENTS_LAUNCH_DATE.toISOString().slice(0, 10)},${total},${withAgent},${percentage}`);
})();
