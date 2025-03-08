const mongoose = require('mongoose');
const mongoMeili = require('~/models/plugins/mongoMeili');
const { messageSchema } = require('@librechat/data-schemas');

// Needs to be moved to the new package
//    rating: {
//       type: String,
//       enum: ['thumbsUp', 'thumbsDown'],
//       default: null,
//     },
//     ratingContent: {
//       tags: {
//         type: [String],
//         default: [],
//       },
//       tagChoices: {
//         type: [String],
//         default: [
//           'Shouldn\'t have used Memory',
//           'Don\'t like the style',
//           'Not factually correct',
//           'Didn\'t fully follow instructions',
//           'Refused when it shouldn\'t have',
//           'Being lazy',
//           'Unsafe or problematic',
//           'Biased',
//           'Other',
//         ],
//       },
//       text: {
//         type: String,
//         default: null,
//       },

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  messageSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    indexName: 'messages',
    primaryKey: 'messageId',
  });
}

const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

module.exports = Message;
