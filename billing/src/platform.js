import { User } from './db.js';
import { config } from './config.js';

// Notifies the JetCode platform that an order was paid, so it provisions the
// client (Linux identity -> subscription -> project -> chat) and the project
// shows up as a model in LibreChat.
//
// The platform endpoint is idempotent by order_id, so redelivery is always
// safe; a failed call leaves platformNotifiedAt unset and the poller retries.

// Tariff titles are free-form; anything mentioning "pro" maps to the pro
// plan, everything else is standard.
export function planFromTariff(title) {
  return /\bpro\b/i.test(title || '') ? 'pro' : 'standard';
}

export async function notifyPlatform(order) {
  if (!config.platformUrl) return false; // integration disabled

  const user = await User.findById(order.user).select('name username email').lean();

  const res = await fetch(`${config.platformUrl}/internal/billing/paid`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      order_id: order.orderNumber,
      email: order.userEmail || user?.email,
      display_name: user?.name || user?.username || order.userEmail,
      plan: planFromTariff(order.tariff?.title),
      project_name: order.tariff?.title || 'Первый проект',
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`platform responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = await res.json();
  console.log(
    `[billing] platform provisioned order ${order.orderNumber}: project=${body.project_id} state=${body.project_state}`,
  );
  return true;
}
