const PaymentRefUserId = require('../models/paymentReference.js'); // Store paymentreference and userID
const Payment = require('../models/payments.js');

const singlePaymentTimeTracker = () => {
  const startTime = new Date();

  // Assuming the end time is set to one month after the start time
  const endTime = new Date(startTime);
  endTime.setMonth(startTime.getMonth() + 1);

  return {
    startTime,
    endTime
  };
};

async function createPaymentRecord(userId, paymentMethod, paymentId, amount, currency, startTime, endTime) {
  const paymentRecord = new Payment({
    userId,
    amount,
    currency,
    paymentId,
    paymentMethod,
    paymentStatus: 'Completed',
    paymentReference: '',
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
  singlePaymentTimeTracker,
  createPaymentRecord,
  getUserSessionFromReference
};