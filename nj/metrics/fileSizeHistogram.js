/* eslint-disable no-undef */

/**
 * Aggregate how many files have been uploaded based on how many megabytes the file is. We added a
 * sanity check: the first result makes sure no files exist where `bytes` is null or zero.
 *
 * Note that this function currently aggregates all files 25 MB or larger into one bucket.
 */
const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_MB_BUCKET = 25;
print(
  [
    'fileSizeMBs,fileCount',
    `zero/null bytes,${db.files.countDocuments({ $or: [{ bytes: 0 }, { bytes: null }] })}`,
    ...db.files
      .aggregate([
        {
          $group: {
            _id: {
              $min: [
                { $floor: { $divide: [{ $ifNull: ['$bytes', 0] }, BYTES_PER_MEGABYTE] } },
                MAX_MB_BUCKET,
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray()
      .map(
        (mb) =>
          `${mb._id < MAX_MB_BUCKET ? `${mb._id}-${mb._id + 1}MB` : `${MAX_MB_BUCKET}+MB`},${mb.count}`,
      ),
  ].join('\n'),
);
