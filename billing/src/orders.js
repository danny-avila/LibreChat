import crypto from 'node:crypto';
import { Order, Tariff } from './db.js';
import { grantSubscription, revokeSubscriptionDays } from './subscriptions.js';
import { alfapay } from './alfapay.js';
import { config } from './config.js';
import { notifyPlatform } from './platform.js';

export function newOrderNumber(userId) {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  return `lc-${String(userId).slice(-6)}-${ts}-${crypto.randomBytes(3).toString('hex')}`;
}

// Idempotent activation: flips `credited` exactly once, then extends the
// user's subscription by the tariff's period. (Tariffs no longer add token
// credits — they gate functionality via the subscription.)
export async function creditOrder(order) {
  const flip = await Order.updateOne(
    { _id: order._id, status: 'paid', credited: { $ne: true } },
    { $set: { credited: true, creditedAt: new Date() } },
  );
  if (flip.modifiedCount !== 1) return false; // already activated or not paid
  const days = order.tariff.durationDays
    ?? (await Tariff.findById(order.tariff.id).lean())?.durationDays
    ?? 30;
  await grantSubscription(order.user, order.tariff, days, 'payment');
  console.log(`[billing] order ${order.orderNumber}: «${order.tariff.title}» +${days}d for ${order.userEmail}`);
  await notifyPlatformOnce(order);
  return true;
}

// Platform provisioning callback. Never blocks activation: a failure only
// leaves platformNotifiedAt unset, and the poller keeps retrying — the
// platform side is idempotent by order_id.
export async function notifyPlatformOnce(order) {
  if (!config.platformUrl || order.platformNotifiedAt) return;
  try {
    if (await notifyPlatform(order)) {
      await Order.updateOne({ _id: order._id }, { $set: { platformNotifiedAt: new Date() } });
    }
  } catch (e) {
    console.error(`[billing] platform notify failed for ${order.orderNumber}: ${e.message}`);
  }
}

// Refund: take the paid period back from the subscription.
export async function debitRefund(order) {
  const days = order.tariff.durationDays
    ?? (await Tariff.findById(order.tariff.id).lean())?.durationDays
    ?? 30;
  await revokeSubscriptionDays(order.user, days);
}

// Pulls the authoritative status from the gateway and applies transitions.
export async function syncOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order || !order.alfaOrderId) return order;
  const terminal = ['paid', 'cancelled', 'refunded', 'auth_declined', 'failed', 'expired'];
  if (terminal.includes(order.status) && order.credited === (order.status === 'paid')) {
    return order;
  }
  let status;
  try {
    status = await alfapay.getStatus(order);
  } catch (e) {
    console.error(`[billing] status sync failed for ${order.orderNumber}: ${e.message}`);
    return order;
  }
  if (status && status !== order.status && order.status !== 'refunded') {
    order.status = status;
  }
  order.lastSyncAt = new Date();
  await order.save();
  if (order.status === 'paid' && !order.credited) await creditOrder(order);
  return order;
}

// Webhook backup: periodically re-check orders that are still in flight.
export function startPoller() {
  const tick = async () => {
    try {
      const cutoff = new Date(Date.now() - config.orderTtlHours * 3600 * 1000);
      const stale = await Order.updateMany(
        { status: { $in: ['created', 'pending'] }, createdAt: { $lt: cutoff } },
        { $set: { status: 'expired' } },
      );
      if (stale.modifiedCount) console.log(`[billing] expired ${stale.modifiedCount} old orders`);
      const open = await Order.find({
        status: { $in: ['pending', 'hold'] },
        createdAt: { $gte: cutoff },
      }).select('_id').lean();
      for (const { _id } of open) await syncOrder(_id);
      // retry paid orders whose platform callback did not land yet
      if (config.platformUrl) {
        const unnotified = await Order.find({
          status: 'paid',
          credited: true,
          platformNotifiedAt: { $exists: false },
        }).limit(20);
        for (const order of unnotified) await notifyPlatformOnce(order);
      }
    } catch (e) {
      console.error('[billing] poller error:', e.message);
    }
  };
  setInterval(tick, config.pollIntervalMs);
  tick();
}
