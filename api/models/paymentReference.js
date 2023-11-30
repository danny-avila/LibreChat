// paymentReference Model
const mongoose = require('mongoose');
const paymentReferenceSchema = require('./schema/paymentReferenceSchema'); // Adjust the path as necessary

const PaymentRefUserId = mongoose.model('PaymentRefUserId', paymentReferenceSchema);

module.exports = {
  PaymentRefUserId,

  async savePaymentRefUserId({ paymentReference, userId, status }) {
    try {
      const newPaymentRefUserId = new PaymentRefUserId({
        paymentReference,
        userId,
        status
      });

      await newPaymentRefUserId.save();
      return newPaymentRefUserId;
    } catch (err) {
      console.error(`Error saving payment reference: ${err}`);
      throw new Error('Failed to save payment reference.');
    }
  },

  async updatePaymentRefUserId(paymentReference, update) {
    try {
      const updatedPaymentRefUserId = await PaymentRefUserId.findByIdAndUpdate(
        paymentReference,
        update,
        { new: true }
      );

      if (!updatedPaymentRefUserId) {
        throw new Error('Payment reference not found.');
      }

      return updatedPaymentRefUserId;
    } catch (err) {
      console.error(`Error updating payment reference: ${err}`);
      throw new Error('Failed to update payment reference.');
    }
  },

  async findPaymentRefUserId(filter) {
    try {
      return await PaymentRefUserId.findOne(filter).exec();
    } catch (err) {
      console.error(`Error finding payment reference: ${err}`);
      throw new Error('Failed to find payment reference.');
    }
  },

  async deletePaymentRefUserId(paymentReference) {
    try {
      return await PaymentRefUserId.findByIdAndDelete(paymentReference).exec();
    } catch (err) {
      console.error(`Error deleting payment reference: ${err}`);
      throw new Error('Failed to delete payment reference.');
    }
  },

  // Add any other methods you might need
};
