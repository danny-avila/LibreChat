import { Router } from 'express';
import mongoose from 'mongoose';
import { Balance, Order, Tariff, Transaction, User } from '../db.js';
import { requireUser, requireAdmin, sameOrigin } from '../auth.js';
import { alfapay } from '../alfapay.js';
import { debitRefund, syncOrder } from '../orders.js';

export const adminRoutes = Router();
adminRoutes.use('/admin', requireUser, requireAdmin);

// Dashboard: orders across all users + revenue summary.
adminRoutes.get('/admin', async (req, res) => {
  const statusFilter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {};
  const [orders, paidAgg] = await Promise.all([
    Order.find(statusFilter).sort({ createdAt: -1 }).limit(200).lean(),
    Order.aggregate([
      { $match: { status: { $in: ['paid', 'refunded'] } } },
      { $group: { _id: '$status', total: { $sum: '$tariff.priceKopecks' }, n: { $sum: 1 } } },
    ]),
  ]);
  const sums = Object.fromEntries(paidAgg.map((r) => [r._id, r]));
  res.render('admin/orders', {
    user: req.user,
    orders,
    sums,
    statusFilter: req.query.status || 'all',
    msg: req.query.msg,
  });
});

adminRoutes.post('/admin/orders/:id/sync', sameOrigin, async (req, res) => {
  await syncOrder(req.params.id);
  res.redirect('/billing/admin?msg=' + encodeURIComponent('Статус обновлён'));
});

adminRoutes.post('/admin/orders/:id/refund', sameOrigin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || order.status !== 'paid') {
    return res.redirect('/billing/admin?msg=' + encodeURIComponent('Возврат возможен только для оплаченного заказа'));
  }
  try {
    await alfapay.refund(order); // full refund
    order.status = 'refunded';
    order.refundedAt = new Date();
    await order.save();
    if (order.credited) await debitRefund(order);
    res.redirect('/billing/admin?msg=' + encodeURIComponent(`Возврат по заказу ${order.orderNumber} проведён`));
  } catch (e) {
    console.error('[billing] refund failed:', e.message);
    res.redirect('/billing/admin?msg=' + encodeURIComponent('Ошибка возврата: ' + e.message));
  }
});

// --- Tariffs CRUD ---

adminRoutes.get('/admin/tariffs', async (req, res) => {
  const tariffs = await Tariff.find().sort({ sort: 1, priceKopecks: 1 }).lean();
  res.render('admin/tariffs', { user: req.user, tariffs, msg: req.query.msg });
});

adminRoutes.post('/admin/tariffs', sameOrigin, async (req, res) => {
  const { id, title, description, priceRub, creditsMln, sort, active } = req.body;
  const doc = {
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    priceKopecks: Math.round(parseFloat(priceRub) * 100),
    credits: Math.round(parseFloat(creditsMln) * 1_000_000),
    sort: parseInt(sort || '0', 10),
    active: active === 'on',
  };
  if (!doc.title || !(doc.priceKopecks > 0) || !(doc.credits > 0)) {
    return res.redirect('/billing/admin/tariffs?msg=' + encodeURIComponent('Заполните название, цену и кредиты'));
  }
  if (id) await Tariff.updateOne({ _id: id }, { $set: doc });
  else await Tariff.create(doc);
  res.redirect('/billing/admin/tariffs?msg=' + encodeURIComponent('Сохранено'));
});

adminRoutes.post('/admin/tariffs/:id/delete', sameOrigin, async (req, res) => {
  await Tariff.deleteOne({ _id: req.params.id });
  res.redirect('/billing/admin/tariffs?msg=' + encodeURIComponent('Тариф удалён'));
});

// --- Users & balances ---

adminRoutes.get('/admin/users', async (req, res) => {
  const users = await User.find().select('email name username role createdAt').lean();
  const balances = await Balance.find().lean();
  const byUser = Object.fromEntries(balances.map((b) => [String(b.user), b.tokenCredits]));
  res.render('admin/users', {
    user: req.user,
    users: users.map((u) => ({ ...u, credits: byUser[String(u._id)] ?? 0 })),
    msg: req.query.msg,
  });
});

// Manual balance adjustment (+/- credits) with an audit trail transaction.
adminRoutes.post('/admin/users/:id/adjust', sameOrigin, async (req, res) => {
  const target = await User.findById(req.params.id).lean();
  const delta = Math.round(parseFloat(req.body.delta) * 1_000_000); // field is in millions
  if (!target || !Number.isFinite(delta) || delta === 0) {
    return res.redirect('/billing/admin/users?msg=' + encodeURIComponent('Некорректная сумма'));
  }
  await Balance.updateOne({ user: target._id }, { $inc: { tokenCredits: delta } }, { upsert: true });
  await Transaction.create({
    user: new mongoose.Types.ObjectId(String(target._id)),
    tokenType: 'credits',
    context: 'admin',
    rawAmount: delta,
    tokenValue: delta,
    model: null,
  });
  console.log(`[billing] admin ${req.user.email} adjusted ${target.email} by ${delta}`);
  res.redirect('/billing/admin/users?msg=' + encodeURIComponent(`Баланс ${target.email} изменён на ${(delta / 1e6).toLocaleString('ru-RU')} млн`));
});
