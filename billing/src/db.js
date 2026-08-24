import mongoose from 'mongoose';
import { config } from './config.js';

// --- LibreChat's own collections (minimal mirrors, strict:false to never fight the app) ---

const userSchema = new mongoose.Schema(
  { email: String, name: String, username: String, role: String },
  { strict: false, collection: 'users' },
);
export const User = mongoose.model('User', userSchema);

const balanceSchema = new mongoose.Schema(
  { user: { type: mongoose.Schema.Types.ObjectId, index: true }, tokenCredits: { type: Number, default: 0 } },
  { strict: false, collection: 'balances' },
);
export const Balance = mongoose.model('Balance', balanceSchema);

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, index: true },
    tokenType: String, // 'credits' for top-ups
    context: String,   // 'payment' | 'admin' | 'refund'
    model: String,
    rawAmount: Number,
    tokenValue: Number,
  },
  { strict: false, collection: 'transactions', timestamps: true },
);
export const Transaction = mongoose.model('Transaction', transactionSchema);

// --- Billing's own collections ---

const tariffSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    priceKopecks: { type: Number, required: true, min: 100 },
    // Subscription period granted by purchasing this tariff.
    durationDays: { type: Number, default: 30, min: 1 },
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { collection: 'billing_tariffs', timestamps: true },
);
export const Tariff = mongoose.model('Tariff', tariffSchema);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userEmail: String,
    // snapshot of the tariff at purchase time
    tariff: {
      id: mongoose.Schema.Types.ObjectId,
      title: String,
      priceKopecks: Number,
      durationDays: Number,
      credits: Number, // legacy orders only (credit packages era)
    },
    orderNumber: { type: String, required: true, unique: true }, // our id, goes to the gateway
    alfaOrderId: { type: String, index: true },                  // orderId from Alfa-Bank
    paymentUrl: String,
    status: {
      type: String,
      enum: ['created', 'pending', 'hold', 'paid', 'cancelled', 'refunded', 'auth_declined', 'failed', 'expired', 'unknown'],
      default: 'created',
      index: true,
    },
    credited: { type: Boolean, default: false },
    creditedAt: Date,
    refundedAt: Date,
    lastSyncAt: Date,
    failReason: String,
  },
  { collection: 'billing_orders', timestamps: true },
);
export const Order = mongoose.model('Order', orderSchema);

// One active subscription per user: which tariff they are on and until when.
const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    tariff: {
      id: mongoose.Schema.Types.ObjectId,
      title: String,
    },
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    source: { type: String, enum: ['payment', 'manual'], default: 'payment' },
  },
  { collection: 'billing_subscriptions', timestamps: true },
);
export const Subscription = mongoose.model('Subscription', subscriptionSchema);

export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUri);
  console.log('[billing] mongo connected');
}
