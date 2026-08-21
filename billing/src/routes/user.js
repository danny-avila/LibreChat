import { Router } from 'express';
import { Balance, Order, Tariff } from '../db.js';
import { requireUser, sameOrigin } from '../auth.js';
import { alfapay } from '../alfapay.js';
import { config } from '../config.js';
import { newOrderNumber, syncOrder } from '../orders.js';

export const userRoutes = Router();

userRoutes.get('/', requireUser, async (req, res) => {
  const [tariffs, balance, orders] = await Promise.all([
    Tariff.find({ active: true }).sort({ sort: 1, priceKopecks: 1 }).lean(),
    Balance.findOne({ user: req.user._id }).lean(),
    Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  res.render('index', {
    user: req.user,
    tariffs,
    balance: balance?.tokenCredits ?? 0,
    orders,
    paid: req.query.paid,
  });
});

userRoutes.post('/buy', requireUser, sameOrigin, async (req, res) => {
  const tariff = await Tariff.findOne({ _id: req.body.tariffId, active: true }).lean();
  if (!tariff) return res.status(400).render('error', { user: req.user, title: 'Ошибка', message: 'Тариф не найден или отключён.' });

  const order = await Order.create({
    user: req.user._id,
    userEmail: req.user.email,
    tariff: { id: tariff._id, title: tariff.title, priceKopecks: tariff.priceKopecks, credits: tariff.credits },
    orderNumber: newOrderNumber(req.user._id),
    status: 'created',
  });

  try {
    const { alfaOrderId, paymentUrl } = await alfapay.register(order, req.user);
    order.alfaOrderId = alfaOrderId;
    order.paymentUrl = paymentUrl;
    order.status = 'pending';
    await order.save();
    return res.redirect(303, paymentUrl);
  } catch (e) {
    console.error('[billing] register.do failed:', e.message);
    order.status = 'failed';
    order.failReason = e.message;
    await order.save();
    return res.status(502).render('error', {
      user: req.user,
      title: 'Платёжный шлюз недоступен',
      message: 'Не удалось создать платёж. Попробуйте ещё раз через пару минут.',
    });
  }
});

// The bank redirects the customer back here after the payment form.
userRoutes.get('/return', requireUser, async (req, res) => {
  const order = await Order.findOne({ _id: req.query.order, user: req.user._id });
  if (!order) return res.redirect(config.basePath);
  const synced = await syncOrder(order._id);
  res.render('return', { user: req.user, order: synced });
});

// --- Mock payment page (driver=mock only): lets us test the full flow without the bank ---

userRoutes.get('/mock-pay', requireUser, async (req, res) => {
  if (config.alfapay.driver !== 'mock') return res.redirect(config.basePath);
  const order = await Order.findOne({ _id: req.query.order, user: req.user._id }).lean();
  if (!order || order.status !== 'pending') return res.redirect(config.basePath);
  res.render('mock-pay', { user: req.user, order });
});

userRoutes.post('/mock-pay', requireUser, sameOrigin, async (req, res) => {
  if (config.alfapay.driver !== 'mock') return res.redirect(config.basePath);
  const order = await Order.findOne({ _id: req.body.order, user: req.user._id });
  if (!order || order.status !== 'pending') return res.redirect(config.basePath);
  order.status = req.body.outcome === 'pay' ? 'paid' : 'auth_declined';
  await order.save();
  const synced = await syncOrder(order._id);
  res.render('return', { user: req.user, order: synced });
});
