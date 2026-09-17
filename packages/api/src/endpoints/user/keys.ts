import { z } from 'zod';
import { AuthKeys, EModelEndpoint } from 'librechat-data-provider';
import type { KeyMethods } from '@librechat/data-schemas';
import type { RequestHandler } from 'express';

export interface UserKeyUpdateDependencies
  extends Pick<KeyMethods, 'updateUserKey' | 'getUserKeySnapshot' | 'compareAndSetUserKey'> {
  decrypt(value: string): Promise<string>;
  now(): number;
}

const requestSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  expiresAt: z
    .string()
    .refine((value) => value === '' || Number.isFinite(new Date(value).getTime()))
    .nullable()
    .optional(),
  preserveGoogleServiceKey: z.boolean().optional(),
});
const googleAPIKeySchema = z
  .object({
    [AuthKeys.GOOGLE_API_KEY]: z.string().refine((value) => value.trim().length > 0),
    baseURL: z.string().optional(),
  })
  .strict();
const serviceKeySchema = z
  .object({
    client_email: z.string().email(),
    project_id: z.string().min(3),
    private_key: z.string().min(601),
  })
  .passthrough();
const savedGoogleSchema = z.object({
  [AuthKeys.GOOGLE_SERVICE_KEY]: z.union([z.string(), serviceKeySchema]).optional(),
});

function preservedServiceKey(value: string): string | z.infer<typeof serviceKeySchema> | undefined {
  try {
    const parsed = savedGoogleSchema.safeParse(JSON.parse(value));
    if (!parsed.success) return;
    const service = parsed.data[AuthKeys.GOOGLE_SERVICE_KEY];
    if (typeof service !== 'string') return service;
    return serviceKeySchema.safeParse(JSON.parse(service)).success ? service : undefined;
  } catch {
    return;
  }
}

/** Preserves an active Google service account without returning saved credentials to the client. */
export function createUserKeyUpdateHandler(deps: UserKeyUpdateDependencies): RequestHandler {
  return async (req, res) => {
    const userId = z.object({ id: z.string().min(1) }).safeParse(req.user);
    if (!userId.success) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body.' });
      return;
    }
    const { name, value, expiresAt, preserveGoogleServiceKey } = parsed.data;
    try {
      if (!preserveGoogleServiceKey) {
        await deps.updateUserKey({ userId: userId.data.id, name, value, expiresAt });
        res.status(201).send();
        return;
      }
      let incoming: z.infer<typeof googleAPIKeySchema>;
      try {
        if (name !== EModelEndpoint.google) throw new Error('Invalid credential slot.');
        incoming = googleAPIKeySchema.parse(JSON.parse(value));
      } catch {
        res.status(400).json({ error: 'Invalid Google API key update.' });
        return;
      }
      const expected = await deps.getUserKeySnapshot({ userId: userId.data.id, name });
      const isActive = () =>
        expected && (!expected.expiresAt || Date.parse(expected.expiresAt) > deps.now());
      const previous = expected && isActive() ? await deps.decrypt(expected.value) : undefined;
      const active = isActive();
      const service = active && previous ? preservedServiceKey(previous) : undefined;
      const merged = service ? { ...incoming, [AuthKeys.GOOGLE_SERVICE_KEY]: service } : incoming;
      const updated = await deps.compareAndSetUserKey({
        userId: userId.data.id,
        name,
        value: JSON.stringify(merged),
        expiresAt,
        expected,
        requireActive: service != null,
      });
      if (!updated) {
        res.status(409).json({ error: 'The saved key changed. Please retry your update.' });
        return;
      }
      res.status(201).send();
    } catch {
      res.status(500).json({ error: 'Unable to update the saved key.' });
    }
  };
}
