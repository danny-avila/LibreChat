const { getMessagesCount } = require('../../models');

const getUserMessageQuotaUsagePastDays = async (user, days = 30) => {
  let currentTime = new Date();
  let quota = 0;
  if ('proMemberExpiredAt' in user && user.proMemberExpiredAt > currentTime) {
    // If not proMember, check quota
    quota = JSON.parse(process.env['CHAT_QUOTA_PER_MONTH_PRO_MEMBER']);
  } else {
    quota = JSON.parse(process.env['CHAT_QUOTA_PER_MONTH']);
  }

  let someTimeAgo = currentTime;
  someTimeAgo.setSeconds(currentTime.getSeconds() - 60 * 60 * 24 * days); // 30 days

  let quotaUsage = {};

  let promises = Object.keys(quota).map(async (model) => {
    let messagesCount = await getMessagesCount({
      $and: [{ senderId: user.id }, { model: model }, { updatedAt: { $gte: someTimeAgo } }],
    });
    quotaUsage[model] = {
      consumed: messagesCount,
      quota: quota[model],
    };
    // console.log(model, quotaUsage[model]);
  });
  await Promise.all(promises);
  return quotaUsage;
};

module.exports = {
  getUserMessageQuotaUsagePastDays,
};
