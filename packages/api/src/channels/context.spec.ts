import express from 'express';
import request from 'supertest';
import session from 'express-session';
import { createChannelContext } from './context';

it('loads only the linked session and rejects expired or different-user sessions', async () => {
  const store = new session.MemoryStore();
  const save = (id: string, appUserId: string, tenantId = 'tenant-a') =>
    new Promise<void>((resolve, reject) => {
      store.set(
        id,
        Object.assign(
          { cookie: Object.assign(new session.Cookie(), { maxAge: 60000 }) },
          {
            openidTokens: {
              appUserId,
              tenantId,
              openidSubject: `subject-${appUserId}`,
              openidIssuer: 'https://id.example',
              accessToken: `private-${appUserId}`,
            },
          },
        ),
        (error) => (error ? reject(error) : resolve()),
      );
    });
  await save('atef-session', 'atef');
  await save('danny-session', 'danny');
  await save('other-tenant-session', 'atef', 'tenant-b');
  let sessionId = 'atef-session';
  let calls = 0;
  const app = express();
  app.use(
    session({ secret: 'test-session-secret', store, resave: false, saveUninitialized: false }),
  );
  app.use((req, _res, next) => {
    Object.assign(req, {
      user: {
        id: 'atef',
        _id: 'atef',
        provider: 'openid',
        openidId: 'subject-atef',
        openidIssuer: 'https://id.example',
        tenantId: 'tenant-a',
      },
      channelSessionId: sessionId,
    });
    next();
  });
  app.use(
    createChannelContext({
      reuseOpenIDTokens: true,
      createOpenIDSessionTokenProvider:
        ({ req, user, tokenPreference }) =>
        async () => {
          calls++;
          expect(req?.sessionID).toBe('atef-session');
          expect(req?.headers?.authorization).toBeUndefined();
          expect(req?.headers?.cookie).toBeUndefined();
          expect(user?.id).toBe('atef');
          expect(tokenPreference).toBe('access_token');
          return { access_token: req?.session?.openidTokens?.accessToken };
        },
    }),
  );
  app.get('/', (_req, res) => {
    res.json({ ok: true });
  });
  await request(app).get('/').set('Authorization', 'Bearer gateway-credential').expect(200);
  expect(calls).toBe(1);
  for (const id of ['missing', 'danny-session', 'other-tenant-session']) {
    sessionId = id;
    const response = await request(app).get('/').expect(401);
    expect(response.body).toEqual({ error: 'account_reconnect_required' });
  }
  expect(calls).toBe(1);
});
