import { Router } from 'express';
import { Order } from '../db.js';
import { syncOrder } from '../orders.js';

export const webhookRoutes = Router();

// Receiver for AlfaPay gateway callbacks. The payload is NOT trusted: we only
// use it to locate the order, then re-fetch the authoritative status from the
// gateway (getOrderStatusExtended.do) inside syncOrder().
webhookRoutes.post('/webhook', async (req, res) => {
  const { mdOrder, orderNumber } = req.body || {};
  const order = await Order.findOne(
    mdOrder ? { alfaOrderId: mdOrder } : { orderNumber },
  ).select('_id').lean();
  if (!order) return res.status(404).json({ ok: false });
  await syncOrder(order._id);
  res.json({ ok: true });
});
