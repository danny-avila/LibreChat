const { updateFileUsage } = require('~/models');

// const mapImageUrls = (files, detail) => {
//   return files
//     .filter((file) => file.type.includes('image'))
//     .map((file) => ({
//       type: 'image_url',
//       image_url: {
//         /* Temporarily set to path to encode later */
//         url: file.filepath,
//         detail,
//       },
//     }));
// };

const processFiles = async (req) => {
  const { file_ids } = req.body;
  const promises = [];
  for (let file_id of file_ids) {
    promises.push(updateFileUsage({ file_id }));
  }

  // TODO: calculate token cost when image is first uploaded
  return await Promise.all(promises);
};

module.exports = {
  processFiles,
};
