/* eslint-disable no-undef */

/**
 * Sum of the number of conversations which received messages grouped by week.
 *
 * The logic is:
 *   1. Days are inherently 1-indexed, start by subtracting 1:
 *    - Su M  Tu W  Th F  Sa
 *    - 0  1  2  3  4  5  6
 *
 *   2. Take the createdAt date and subtract ( 24 hours in milliseconds * its dayOfWeek index )
 *
 *   3. Convert this calculated date value to a date-string of the form YEAR-MONTH-DAY
 *
 *   4. Use this date-string as well as the conversationId as group-by columns, then sum over all
 *      conversations
 *
 *   5. Print comma-separated lines to easily export results as a CSV.
 *
 * Without doing obnoxious date manipulation, here each week starts on Sunday at midnight UTC.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
print(
  [
    'weekOf,activeConversations',
    ...db.messages
      .aggregate([
        {
          $group: {
            _id: {
              weekOf: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: {
                    $subtract: [
                      '$createdAt',
                      { $multiply: [{ $subtract: [{ $dayOfWeek: '$createdAt' }, 1] }, MS_PER_DAY] },
                    ],
                  },
                },
              },
              conversationId: '$conversationId',
            },
          },
        },
        { $group: { _id: '$_id.weekOf', activeConversations: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray()
      .map((d) => `${d._id},${d.activeConversations}`),
  ].join('\n'),
);
