import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import { connectDb, Tariff } from './src/db.js';
import { startPoller } from './src/orders.js';
import { userRoutes } from './src/routes/user.js';
import { adminRoutes } from './src/routes/admin.js';
import { webhookRoutes } from './src/routes/webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Template helpers
app.locals.fmtRub = (kopecks) => (kopecks / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
app.locals.fmtCredits = (c) =>
  Math.abs(c) >= 1_000_000
    ? (c / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' млн'
    : (c ?? 0).toLocaleString('ru-RU');
app.locals.fmtDate = (d) => (d ? new Date(d).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }) : '—');
app.locals.statusRu = (s) =>
  ({
    created: 'создан', pending: 'ожидает оплаты', hold: 'холдирование', paid: 'оплачен',
    cancelled: 'отменён', refunded: 'возврат', auth_declined: 'отклонён банком',
    failed: 'ошибка', expired: 'просрочен', unknown: 'неизвестно',
  })[s] || s;
app.locals.basePath = config.basePath;

// Everything lives under /billing (Traefik routes the prefix here without stripping).
app.use(`${config.basePath}/static`, express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get(`${config.basePath}/healthz`, (req, res) => res.json({ ok: true }));
app.use(config.basePath, webhookRoutes);
app.use(config.basePath, adminRoutes);
app.use(config.basePath, userRoutes);
app.use((req, res) => res.redirect(config.basePath));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[billing] unhandled:', err);
  res.status(500).render('error', { user: req.user || null, title: 'Ошибка сервера', message: 'Что-то пошло не так. Попробуйте позже.' });
});

async function seedTariffs() {
  if (await Tariff.countDocuments()) return;
  await Tariff.insertMany([
    { title: 'Старт', description: 'Для знакомства с платформой', priceKopecks: 500_00, durationDays: 30, sort: 10 },
    { title: 'Стандарт', description: 'Оптимально для регулярной работы', priceKopecks: 1500_00, durationDays: 30, sort: 20 },
    { title: 'Про', description: 'Максимум возможностей', priceKopecks: 5000_00, durationDays: 30, sort: 30 },
  ]);
  console.log('[billing] seeded default tariffs');
}

await connectDb();
await seedTariffs();
startPoller();
app.listen(config.port, () => console.log(`[billing] listening on :${config.port}${config.basePath} (driver=${config.alfapay.driver})`));
