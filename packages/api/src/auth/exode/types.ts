import { z } from 'zod';
import type { IUser } from '@librechat/data-schemas';

export interface ExodeExchangeInput {
  token: string;
  handshakeId: string;
  parentOrigin: string;
}

export interface ExodeIdentity {
  subject: string;
  userId: number;
  userUuid: string;
  name: string;
  avatar?: string;
  schoolId?: number;
  sellerId?: number;
}

export interface ExodeMainExchange {
  identity: ExodeIdentity;
  token: string;
  expiresAt: string;
}

export const exodeExchangeInputSchema: z.ZodType<ExodeExchangeInput> = z
  .object({
    token: z.string().min(16).max(16_384),
    handshakeId: z.string().uuid(),
    parentOrigin: z.string().min(1).max(2_048),
  })
  .strict();

export const exodeMainResponseSchema: z.ZodType<{ payload: ExodeMainExchange }> = z.object({
  payload: z.object({
    identity: z.object({
      subject: z.string().min(16).max(256),
      userId: z.number().int().positive(),
      userUuid: z.string().uuid(),
      name: z.string().min(1).max(256),
      avatar: z.string().url().max(2_048).optional(),
      schoolId: z.number().int().positive().optional(),
      sellerId: z.number().int().positive().optional(),
    }),
    token: z.string().min(16).max(16_384),
    expiresAt: z.string().datetime(),
  }),
});

export interface ExodeExchangeUser {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string;
  role: string;
  provider: string;
  tenantId?: string;
  plugins?: string[];
  twoFactorEnabled?: boolean;
  personalization?: IUser['personalization'];
  createdAt: string;
  updatedAt: string;
}

export interface ExodeExchangeResponse {
  token: string;
  tokenExpiresAt: string;
  mcpExpiresAt: string;
  user: ExodeExchangeUser;
}

export class ExodeExchangeError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ExodeExchangeError';
  }
}
