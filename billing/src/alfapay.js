import crypto from 'node:crypto';
import { config } from './config.js';

// Client for the AlfaPay Gateway (proxy to Alfa-Bank acquiring, Bearer auth).
// driver 'mock' simulates the gateway locally so the whole flow can be tested
// before real credentials are configured.

async function alfaRequest(path, body, extraHeaders = {}) {
  const { baseUrl, apiKey, projectId } = config.alfapay;
  if (!baseUrl || !apiKey) throw new Error('AlfaPay is not configured (ALFAPAY_BASE_URL / ALFAPAY_API_KEY)');
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(projectId ? { 'X-Project-Id': projectId } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = data.message || `AlfaPay HTTP ${res.status}`;
    const err = new Error(msg);
    err.data = data;
    throw err;
  }
  return data;
}

export const alfapay = {
  // -> { alfaOrderId, paymentUrl }
  async register(order, user) {
    if (config.alfapay.driver === 'mock') {
      return {
        alfaOrderId: `mock-${crypto.randomUUID()}`,
        paymentUrl: `${config.publicUrl}${config.basePath}/mock-pay?order=${order._id}`,
      };
    }
    const data = await alfaRequest(
      '/api/register.do',
      {
        amount: order.tariff.priceKopecks,
        currency: 810,
        language: 'ru',
        description: `Пакет «${order.tariff.title}» — ${order.tariff.credits.toLocaleString('ru-RU')} кредитов`,
        email: user.email,
        return_url: `${config.publicUrl}${config.basePath}/return?order=${order._id}`,
        fail_url: `${config.publicUrl}${config.basePath}/return?order=${order._id}`,
      },
      { 'Idempotency-Key': order.orderNumber },
    );
    return { alfaOrderId: data.order_id, paymentUrl: data.payment_url };
  },

  // -> normalized status string (order.status enum)
  async getStatus(order) {
    if (config.alfapay.driver === 'mock') {
      // In mock mode the status is whatever the fake payment page already set.
      return order.status;
    }
    const data = await alfaRequest('/api/getOrderStatusExtended.do', {
      order_id: order.alfaOrderId,
      order_number: order.orderNumber,
    });
    return data.order_status || 'unknown';
  },

  async refund(order, amountKopecks) {
    if (config.alfapay.driver === 'mock') return { ok: true };
    return alfaRequest('/api/refund.do', {
      order_id: order.alfaOrderId,
      ...(amountKopecks ? { amount: amountKopecks } : {}),
    });
  },
};
