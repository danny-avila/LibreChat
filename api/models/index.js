const {
  comparePassword,
  deleteUserById,
  generateToken,
  getUserById,
  updateUser,
  createUser,
  countUsers,
  findUser,
} = require('./userMethods');
const {
  findFileById,
  createFile,
  updateFile,
  deleteFile,
  deleteFiles,
  getFiles,
  updateFileUsage,
} = require('./File');
const {
  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,
} = require('./Message');
const { getConvoTitle, getConvo, saveConvo, deleteConvos } = require('./Conversation');
const { getPreset, getPresets, savePreset, deletePresets } = require('./Preset');
const { createToken, findToken, updateToken, deleteTokens } = require('./Token');
const {
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
} = require('./SubscriptionPlan'); // CRUD methods for SubscriptionPlan
const {
  getPayments,      // CRUD method to retrieve payments
  createPayment,    // CRUD method to create a payment
  updatePayment,    // CRUD method to update a payment
  deletePayment,    // CRUD method to delete a payment
} = require('./Payment'); // Import CRUD methods for Payment
const {
  getSubscriptions,     // CRUD method to retrieve subscriptions
  createSubscription,    // CRUD method to create a subscription
  updateSubscription,    // CRUD method to update a subscription
  deleteSubscription,    // CRUD method to delete a subscription
} = require('./Subscription'); // Import CRUD methods for Subscription
const Session = require('./Session');
const Balance = require('./Balance');
const User = require('./User');
const Key = require('./Key');
const SubscriptionPlan = require('./SubscriptionPlan'); // SubscriptionPlan model
const Payment = require('./Payment'); // Payment model
const Subscription = require('./Subscription'); // Subscription model

module.exports = {
  comparePassword,
  deleteUserById,
  generateToken,
  getUserById,
  updateUser,
  createUser,
  countUsers,
  findUser,

  findFileById,
  createFile,
  updateFile,
  deleteFile,
  deleteFiles,
  getFiles,
  updateFileUsage,

  getMessages,
  saveMessage,
  recordMessage,
  updateMessage,
  deleteMessagesSince,
  deleteMessages,

  getConvoTitle,
  getConvo,
  saveConvo,
  deleteConvos,

  getPreset,
  getPresets,
  savePreset,
  deletePresets,

  createToken,
  findToken,
  updateToken,
  deleteTokens,

  getSubscriptionPlans, // Export CRUD operations for SubscriptionPlan
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,

  getPayments, // Export CRUD operations for Payment
  createPayment,
  updatePayment,
  deletePayment,

  getSubscriptions, // Export CRUD operations for Subscription
  createSubscription,
  updateSubscription,
  deleteSubscription,

  User,
  Key,
  Session,
  Balance,
  SubscriptionPlan, // Export the SubscriptionPlan model
  Payment, // Export the Payment model
  Subscription, // Export the Subscription model
};
