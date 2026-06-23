/* eslint-disable no-undef */

/**
 * Total number of conversations ever.
 */
db.conversations.countDocuments();

/**
 * Number of conversations that are not archived.
 */
db.conversations.countDocuments({ isArchived: { $ne: true } });

/**
 * Number of conversations that are archived.
 */
db.conversations.countDocuments({ isArchived: { $eq: true } });
