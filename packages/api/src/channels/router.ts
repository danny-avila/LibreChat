import { z } from 'zod';
import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { getTenantId, tenantStorage } from '@librechat/data-schemas';
import { createSlackClient } from 'librechat-data-provider/channels';
import {
  channelConnectionSchema,
  channelEnvelopeSchema,
  channelsConfigSchema,
} from 'librechat-data-provider';
import type {
  ChannelCredentials,
  ChannelConnection,
  ChannelGatewayInstallation,
  ChannelsConfig,
} from 'librechat-data-provider';
import type { ChannelInstallation, ChannelStore, UserRecord } from '@librechat/data-schemas';
import type { Request, RequestHandler, Response } from 'express';
import type { OpenIDRequest } from '~/auth/openid/types';
import { createAuthIdentityContext, isOpenIDSessionIdentityMatch } from '~/utils/identity';
import { createChannelCipher, channelHash, channelSecretMatches } from './crypto';
import { isTwoFactorEnrollmentRequired } from '~/auth/twoFactor';
import { createSlackManifest } from './manifest';
import { isEnabled } from '~/utils';

interface ChannelRequest extends Request {
  user?: UserRecord & { id: string };
  tenantId?: string;
  channelSessionId?: string;
}
interface Dependencies {
  store: ChannelStore;
  loadConfig: () => Promise<{ channels?: Partial<ChannelsConfig> } | null>;
  env: NodeJS.ProcessEnv;
  browserAuth: RequestHandler;
  terms: RequestHandler;
  checkBan: RequestHandler;
  configMiddleware: RequestHandler;
  checkFeature: RequestHandler;
  checkAgent: RequestHandler;
  context: RequestHandler;
  execute: RequestHandler;
  findUser: (query: { _id: string }) => Promise<UserRecord | null>;
  isPrincipalActive: (userId: string) => Promise<boolean>;
  fetcher?: Parameters<typeof createSlackClient>[0];
  reportError: (code: string) => void;
}
const credentialsSchema = z.object({
  botToken: z.string(),
  signingSecret: z.string(),
  appToken: z.string().optional(),
});
const ownerSchema = z.object({ owner: z.string().uuid() });
const linkSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().regex(/^[a-f0-9]{16}$/),
});
const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })),
});
const tenant = (req: ChannelRequest): string =>
  req.tenantId ?? req.user?.tenantId ?? getTenantId() ?? 'default';
const userId = (req: ChannelRequest): string => req.user?.id ?? '';
const fail = (res: Response, status: number, code: string) =>
  res.status(status).json({ error: code });
const publicConnection = (value: ChannelInstallation, linked = false): ChannelConnection => ({
  id: value.id,
  agentId: value.agentId,
  name: value.name,
  appId: value.appId.startsWith('draft_') ? '' : value.appId,
  teamId: value.teamId.startsWith('draft_') ? '' : value.teamId,
  botUserId: value.botUserId,
  mode: value.mode,
  enabled: value.enabled,
  linked,
});

export function createChannelsRouter(deps: Dependencies): Router {
  const router = Router();
  const store = deps.store;
  const cipher = createChannelCipher(deps.env.CREDS_KEY ?? '');
  const fetcher = deps.fetcher ?? fetch;
  const needsSession = (req: ChannelRequest) =>
    isEnabled(deps.env.OPENID_REUSE_TOKENS) &&
    Boolean(req.user?.openidId || req.user?.provider === 'openid') &&
    !isOpenIDSessionIdentityMatch(
      (req as ChannelRequest & OpenIDRequest).session?.openidTokens,
      createAuthIdentityContext({ user: req.user }),
    );
  const config = async () => channelsConfigSchema.parse((await deps.loadConfig())?.channels ?? {});
  const decode = (installation: ChannelInstallation): ChannelCredentials =>
    credentialsSchema.parse(JSON.parse(cipher.decrypt(installation.credentials, installation.id)));
  const guarded =
    (handler: (req: ChannelRequest, res: Response) => Promise<unknown>): RequestHandler =>
    async (req, res) => {
      try {
        await handler(req as ChannelRequest, res);
      } catch (error) {
        const invalid = error instanceof z.ZodError;
        deps.reportError(invalid ? 'invalid_request' : 'operation_failed');
        if (!res.headersSent)
          fail(res, invalid ? 400 : 503, invalid ? 'invalid_request' : 'operation_failed');
      }
    };
  router.get(
    '/availability',
    guarded(async (_req, res) => res.json({ enabled: (await config()).enabled })),
  );
  router.use(async (_req, res, next) => {
    try {
      if (!(await config()).enabled) {
        fail(res, 404, 'channels_disabled');
        return;
      }
      next();
    } catch {
      fail(res, 503, 'configuration_unavailable');
    }
  });

  const gateway = Router();
  gateway.use(async (req, res, next) => {
    try {
      const settings = await config();
      const expected = deps.env[settings.serviceTokenEnv];
      const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (!expected || expected.length < 32 || !channelSecretMatches(token, expected)) {
        fail(res, 401, 'invalid_gateway_credential');
        return;
      }
      next();
    } catch {
      fail(res, 503, 'configuration_unavailable');
    }
  });
  gateway.get(
    '/settings',
    guarded(async (_req, res) => {
      const settings = await config();
      const installations: ChannelGatewayInstallation[] = [];
      for (const item of await store.installations()) {
        if (item.appId.startsWith('draft_')) continue;
        installations.push({ ...publicConnection(item), credentials: decode(item) });
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ config: settings, installations });
    }),
  );
  gateway.post(
    '/events',
    guarded(async (req, res) => {
      const envelope = channelEnvelopeSchema.parse(req.body);
      const [installation, settings] = await Promise.all([
        store.get(envelope.installationId),
        config(),
      ]);
      if (!installation?.enabled || installation.teamId !== envelope.teamId)
        return fail(res, 403, 'connection_unavailable');
      if (envelope.text.length > settings.maxMessageChars)
        return fail(res, 413, 'message_too_long');
      if (!envelope.startsThread && !(await store.hasThread(envelope)))
        return res.json({ accepted: false });
      await store.enqueue(envelope);
      res.json({ accepted: true });
    }),
  );
  gateway.post(
    '/stop',
    guarded(async (req, res) => {
      const input = z
        .object({
          installationId: z.string().uuid(),
          senderId: z.string(),
          destinationId: z.string(),
          threadId: z.string(),
          sentAt: z.number().finite().nonnegative(),
        })
        .parse(req.body);
      const installation = await store.get(input.installationId);
      if (
        !installation ||
        !(await store.link(installation.id, installation.tenantId, input.senderId))
      )
        return fail(res, 403, 'account_not_linked');
      await store.cancel(
        installation.id,
        input.senderId,
        input.destinationId,
        input.threadId,
        input.sentAt,
      );
      res.json({ stopped: true });
    }),
  );
  gateway.post(
    '/work',
    guarded(async (_req, res) => res.json(await store.claim((await config()).leaseMs))),
  );
  gateway.post(
    '/work/:id/renew',
    guarded(async (req, res) => {
      const { owner } = ownerSchema.parse(req.body);
      const work = await store.work(String(req.params.id), owner);
      const installation = work ? await store.get(work.envelope.installationId) : null;
      const link =
        installation && work
          ? await store.link(installation.id, installation.tenantId, work.envelope.senderId)
          : null;
      const valid =
        installation?.enabled &&
        (!work?.userId || link?.userId === work.userId) &&
        (await store.renew(String(req.params.id), owner, (await config()).leaseMs));
      res.json({ valid: Boolean(valid) });
    }),
  );
  gateway.post(
    '/work/:id/sending',
    guarded(async (req, res) => {
      const { owner } = ownerSchema.parse(req.body);
      const work = await store.work(String(req.params.id), owner);
      const installation = work ? await store.get(work.envelope.installationId) : null;
      if (!work || !installation?.enabled) return res.json({ valid: false });
      if (work.userId && !work.reply?.private) {
        const link = await store.link(
          installation.id,
          installation.tenantId,
          work.envelope.senderId,
        );
        if (link?.userId !== work.userId) {
          await store.settle(work.id, owner, 'uncertain', 0);
          return res.json({ valid: false });
        }
      }
      res.json({ valid: await store.sending(work.id, owner) });
    }),
  );
  gateway.post(
    '/work/:id/settle',
    guarded(async (req, res) => {
      const input = ownerSchema
        .extend({
          outcome: z.enum(['done', 'retry', 'uncertain']),
          delayMs: z.number().min(0).max(86400000).default(0),
          slackMessageId: z.string().optional(),
        })
        .parse(req.body);
      res.json({
        valid: await store.settle(
          String(req.params.id),
          input.owner,
          input.outcome,
          input.delayMs,
          input.slackMessageId,
        ),
      });
    }),
  );
  gateway.post(
    '/work/:id/invoke',
    async (baseReq, res, next) => {
      const req = baseReq as ChannelRequest;
      try {
        const { owner } = ownerSchema.parse(req.body);
        const id = String(req.params.id);
        const work = await store.work(id, owner);
        if (!work || work.status !== 'claimed') {
          fail(res, 409, 'work_unavailable');
          return;
        }
        const installation = await store.get(work.envelope.installationId);
        if (!installation?.enabled) {
          fail(res, 403, 'connection_unavailable');
          return;
        }
        const settings = await config();
        const link = await store.link(
          installation.id,
          installation.tenantId,
          work.envelope.senderId,
        );
        if (!link) {
          const token = randomBytes(32).toString('hex');
          const code = randomBytes(8).toString('hex');
          if (!settings.publicUrl) {
            fail(res, 503, 'configuration_unavailable');
            return;
          }
          await store.challenge({
            installationId: installation.id,
            tenantId: installation.tenantId,
            senderId: work.envelope.senderId,
            tokenHash: channelHash(token),
            codeHash: channelHash(code),
            expiresAt: new Date(Date.now() + settings.challengeTtlMs),
          });
          const url = new URL('channels/link', `${settings.publicUrl.replace(/\/$/, '')}/`);
          url.searchParams.set('token', token);
          const reply = {
            private: true,
            text: `Connect your LibreChat account to ${installation.name}: ${url}\nEnter this code after signing in: ${code}\nDo not share this link or code.`,
          };
          await store.reply(id, owner, reply);
          res.json(reply);
          return;
        }
        await tenantStorage.run(
          { tenantId: installation.tenantId === 'default' ? undefined : installation.tenantId },
          async () => {
            const [user, active] = await Promise.all([
              deps.findUser({ _id: link.userId }),
              deps.isPrincipalActive(link.userId),
            ]);
            if (
              !user ||
              !active ||
              (user.tenantId ?? 'default') !== installation.tenantId ||
              isTwoFactorEnrollmentRequired(user)
            ) {
              await store.reply(id, owner, {
                private: true,
                text: 'Your LibreChat account is unavailable. Sign in to LibreChat and reconnect this Slack account.',
              });
              res.json({
                private: true,
                text: 'Your LibreChat account is unavailable. Sign in to LibreChat and reconnect this Slack account.',
              });
              return;
            }
            req.channelSessionId = link.session
              ? cipher.decrypt(link.session, installation.id)
              : undefined;
            req.user = { ...user, id: link.userId };
            req.tenantId = installation.tenantId === 'default' ? undefined : installation.tenantId;
            delete req.headers['x-tenant-id'];
            const history = await store.history(work.envelope, settings.maxHistoryChars);
            req.body = {
              model: installation.agentId,
              stream: false,
              messages: [
                ...history,
                {
                  role: 'user',
                  content: work.envelope.isDirect
                    ? work.envelope.text
                    : `[${work.envelope.senderId}] ${work.envelope.text}`,
                },
              ],
            };
            if (!(await store.begin(id, owner, link.userId))) {
              fail(res, 409, 'work_unavailable');
              return;
            }
            const privateFailure = {
              text: `This request could not finish. Sign in to LibreChat to check your agent access, reconnect your tools, or approve the request. ${settings.publicUrl ?? ''}/channels`,
              private: true,
            };
            const originalJson = res.json.bind(res);
            let interactionRequired = false;
            // Tool OAuth can emit browser events even for a non-streaming completion.
            // Disconnect cancels the existing runtime; only the private notice enters the outbox.
            res.write = () => {
              if (interactionRequired) return false;
              interactionRequired = true;
              res.destroy();
              void store
                .reply(id, owner, privateFailure)
                .then((saved) => (saved ? store.settle(id, owner, 'retry', 0) : undefined))
                .catch(() => deps.reportError('interaction_notice_failed'));
              return false;
            };
            res.json = (value: unknown) => {
              if (interactionRequired) return res;
              const completion = completionSchema.safeParse(value);
              const text = completion.success ? completion.data.choices[0]?.message.content : null;
              const success = res.statusCode < 400 && Boolean(text);
              const visible =
                text && text.length > settings.maxReplyChars
                  ? `${text.slice(0, settings.maxReplyChars - 100)}\n\n[Reply shortened. Ask for a smaller part.]`
                  : text;
              const reply = success ? { text: visible!, private: false } : privateFailure;
              void store
                .reply(id, owner, reply)
                .then((saved) => {
                  if (!res.destroyed) {
                    res.status(saved ? 200 : 409);
                    originalJson(saved ? reply : { error: 'work_unavailable' });
                  }
                })
                .catch(() => {
                  if (!res.destroyed) {
                    res.status(503);
                    originalJson({ error: 'result_not_saved' });
                  }
                });
              return res;
            };
            next();
          },
        );
      } catch {
        deps.reportError('invocation_failed');
        if (!res.headersSent) fail(res, 503, 'invocation_failed');
      }
    },
    deps.terms,
    deps.checkBan,
    deps.configMiddleware,
    deps.checkFeature,
    deps.checkAgent,
    deps.context,
    deps.execute,
  );
  router.use('/gateway', gateway);

  router.use(deps.browserAuth, deps.terms);
  router.get(
    '/',
    guarded(async (req, res) => {
      const [owned, links] = await Promise.all([
        store.list(tenant(req), userId(req)),
        store.userLinks(tenant(req), userId(req)),
      ]);
      const items = new Map(owned.map((item) => [item.id, item]));
      const linkedItems = await Promise.all(
        links
          .filter((link) => !items.has(link.installationId))
          .map((link) => store.get(link.installationId)),
      );
      for (const item of linkedItems) {
        if (item?.tenantId === tenant(req)) items.set(item.id, item);
      }
      res.json({
        connections: [...items.values()].map((item) => ({
          ...publicConnection(
            item,
            links.some((link) => link.installationId === item.id),
          ),
          editable: item.ownerId === userId(req),
        })),
      });
    }),
  );
  router.post(
    '/manifest',
    guarded(async (req, res) => {
      const input = z
        .object({
          agentId: z.string().min(1),
          mode: z.enum(['http', 'socket']).default('http'),
          installationId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const [agent, settings] = await Promise.all([store.agent(input.agentId), config()]);
      if (!agent || agent.ownerId !== userId(req)) return fail(res, 403, 'agent_owner_required');
      if (!settings.gatewayUrl) return fail(res, 503, 'configuration_unavailable');
      const existing = input.installationId
        ? await store.get(input.installationId)
        : (await store.list(tenant(req), userId(req))).find((item) => item.agentId === agent.id);
      if (
        existing &&
        (existing.tenantId !== tenant(req) ||
          existing.ownerId !== userId(req) ||
          existing.agentId !== agent.id)
      )
        return fail(res, 403, 'access_denied');
      const id = existing?.id ?? randomUUID();
      if (!existing)
        await store.save({
          id,
          tenantId: tenant(req),
          ownerId: userId(req),
          agentId: agent.id,
          name: agent.name,
          mode: input.mode,
          enabled: false,
          appId: `draft_${id}`,
          teamId: `draft_${id}`,
          botUserId: 'draft',
          credentials: cipher.encrypt(JSON.stringify({ botToken: '', signingSecret: '' }), id),
        });
      res.json({
        installationId: id,
        manifest: createSlackManifest({
          name: agent.name,
          description: agent.description,
          gatewayUrl: settings.gatewayUrl,
          installationId: id,
          mode: input.mode,
          ingressReady: existing != null && !existing.appId.startsWith('draft_'),
        }),
      });
    }),
  );
  router.put(
    '/:id',
    guarded(async (req, res) => {
      const input = channelConnectionSchema.parse(req.body);
      const installation = await store.get(String(req.params.id));
      if (
        !installation ||
        installation.ownerId !== userId(req) ||
        installation.tenantId !== tenant(req) ||
        installation.agentId !== input.agentId
      )
        return fail(res, 403, 'access_denied');
      const agent = await store.agent(input.agentId);
      if (!agent || agent.ownerId !== userId(req)) return fail(res, 403, 'agent_owner_required');
      const previous = decode(installation);
      const credentials = {
        botToken: input.botToken ?? previous.botToken,
        signingSecret: input.signingSecret ?? previous.signingSecret,
        appToken: input.appToken ?? previous.appToken,
      };
      if (
        !credentials.botToken ||
        !credentials.signingSecret ||
        (input.mode === 'socket' && !credentials.appToken)
      )
        return fail(res, 400, 'credentials_required');
      const identity = await createSlackClient(fetcher, (await config()).requestTimeoutMs).identity(
        credentials.botToken,
      );
      if (
        identity.appId !== input.appId ||
        (!installation.appId.startsWith('draft_') &&
          (identity.appId !== installation.appId || identity.teamId !== installation.teamId))
      )
        return fail(res, 400, 'installation_mismatch');
      const updated = {
        ...installation,
        ...identity,
        name: agent.name,
        mode: input.mode,
        enabled: installation.enabled,
        credentials: cipher.encrypt(JSON.stringify(credentials), installation.id),
      };
      await store.save(updated);
      res.json(publicConnection(updated));
    }),
  );
  router.post(
    '/:id/check',
    guarded(async (req, res) => {
      const item = await store.get(String(req.params.id));
      if (!item || item.ownerId !== userId(req) || item.tenantId !== tenant(req))
        return fail(res, 403, 'access_denied');
      const credentials = decode(item);
      const slack = createSlackClient(fetcher, (await config()).requestTimeoutMs);
      const identity = await slack.identity(credentials.botToken);
      if (item.mode === 'socket' && credentials.appToken) {
        await slack.call('apps.connections.open', credentials.appToken, {});
      }
      if (identity.appId !== item.appId || identity.teamId !== item.teamId)
        return fail(res, 400, 'installation_mismatch');
      res.json({ connected: true });
    }),
  );
  router.post(
    '/:id/enable',
    guarded(async (req, res) => {
      const item = await store.get(String(req.params.id));
      if (!item || item.ownerId !== userId(req) || item.tenantId !== tenant(req))
        return fail(res, 403, 'access_denied');
      const agent = await store.agent(item.agentId);
      if (!agent || agent.ownerId !== userId(req)) return fail(res, 403, 'agent_owner_required');
      if (item.appId.startsWith('draft_')) return fail(res, 400, 'credentials_required');
      await store.save({ ...item, enabled: true });
      res.json({ enabled: true });
    }),
  );
  router.post(
    '/:id/disable',
    guarded(async (req, res) => {
      const item = await store.get(String(req.params.id));
      if (!item || item.ownerId !== userId(req) || item.tenantId !== tenant(req))
        return fail(res, 403, 'access_denied');
      await store.save({ ...item, enabled: false });
      res.json({ disabled: true });
    }),
  );
  router.delete(
    '/:id/link',
    guarded(async (req, res) => {
      await store.unlink(String(req.params.id), tenant(req), userId(req));
      res.json({ unlinked: true });
    }),
  );
  router.get(
    '/link/:token',
    guarded(async (req, res) => {
      const challenge = await store.getChallenge(channelHash(String(req.params.token)));
      const item = challenge ? await store.get(challenge.installationId) : null;
      if (!challenge || !item?.enabled || challenge.tenantId !== tenant(req))
        return fail(res, 404, 'link_expired');
      res.setHeader('Cache-Control', 'no-store');
      const settings = await config();
      const reauthUrl =
        needsSession(req) && settings.publicUrl
          ? new URL('oauth/openid?prompt=login', `${settings.publicUrl.replace(/\/$/, '')}/`).href
          : undefined;
      res.json({ name: item.name, teamId: item.teamId, senderId: challenge.senderId, reauthUrl });
    }),
  );
  router.post(
    '/link',
    guarded(async (req, res) => {
      const input = linkSchema.parse(req.body);
      const challenge = await store.getChallenge(channelHash(input.token));
      const item = challenge ? await store.get(challenge.installationId) : null;
      if (!item?.enabled || item.tenantId !== tenant(req)) return fail(res, 404, 'link_expired');
      if (needsSession(req)) return fail(res, 403, 'account_reconnect_required');
      const session = req.sessionID ? cipher.encrypt(req.sessionID, item.id) : undefined;
      const linked = await store.confirm(
        channelHash(input.token),
        channelHash(input.code),
        tenant(req),
        userId(req),
        session,
      );
      if (!linked) return fail(res, 400, 'link_invalid');
      res.json({ linked: true });
    }),
  );
  router.use(
    (error: Error, _req: Request, res: Response, _next: import('express').NextFunction) => {
      deps.reportError('channel_request_failed');
      if (!res.headersSent) fail(res, 503, 'request_failed');
    },
  );
  return router;
}
