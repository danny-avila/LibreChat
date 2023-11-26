const PaymentRefUserId = require('../models/paymentReference.js'); // Store paymentreference and userID
const Payment = require('../models/payments.js');

const calcExpiryDate = (planType) => {
  const startTime = new Date();
  let endTime = new Date(startTime);

  switch (planType) {
    case 'month':
      endTime.setMonth(startTime.getMonth() + 1);
      break;
    case 'quarter':
      endTime.setMonth(startTime.getMonth() + 3);
      break;
    case 'year':
      endTime.setFullYear(startTime.getFullYear() + 1);
      break;
    default:
      throw new Error('Invalid plan type');
  }

  return {
    startTime,
    endTime
  };
};

async function createPaymentRecord(userId, paymentMethod, paymentId, amount, currency, planId, startTime, endTime) {
  const paymentRecord = new Payment({
    userId,
    amount,
    currency,
    paymentId,
    paymentMethod,
    paymentStatus: 'Completed',
    paymentReference: '',
    planId,
    startTime,
    endTime
  });

  await paymentRecord.save();
}

async function getUserSessionFromReference(paymentReference) {
  try {
    const paymentRefUserId = await PaymentRefUserId.findPaymentRefUserId({ paymentReference });
    if (paymentRefUserId) {
      return { userId: paymentRefUserId.userId };
    } else {
      console.error('[getUserSessionFromReference] Payment reference not found.');
      return null;
    }
  } catch (err) {
    console.error(`[getUserSessionFromReference] Error: ${err}`);
    throw err;
  }
}

module.exports = {
  calcExpiryDate,
  createPaymentRecord,
  getUserSessionFromReference
};