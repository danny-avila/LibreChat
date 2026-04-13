# Magic Link Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-generated permanent login links that auto-create student accounts (USER role) on first use, revocable from a `/d/magic-links` dashboard page.

**Architecture:** New `MagicLink` MongoDB collection in `packages/data-schemas`; business logic in `packages/api/src/auth/magiclink.ts`; thin JS wrappers in `/api`; frontend at `/d/magic-links` using React Query. Tokens are 32 random bytes, SHA-256 hashed for storage — the raw 64-char hex string goes in the URL.

**Tech Stack:** TypeScript (packages/data-schemas, packages/api, packages/data-provider, client), JavaScript (api routes), Mongoose, React Query, React Router v6, `@tanstack/react-query`.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| CREATE | `packages/data-schemas/src/schema/magiclink.ts` | Mongoose schema |
| CREATE | `packages/data-schemas/src/types/magiclink.ts` | TypeScript interfaces |
| CREATE | `packages/data-schemas/src/models/magiclink.ts` | Model factory |
| CREATE | `packages/data-schemas/src/methods/magiclink.ts` | CRUD methods factory |
| MODIFY | `packages/data-schemas/src/schema/index.ts` | export magicLinkSchema |
| MODIFY | `packages/data-schemas/src/types/index.ts` | export MagicLink types |
| MODIFY | `packages/data-schemas/src/models/index.ts` | register MagicLink model |
| MODIFY | `packages/data-schemas/src/methods/index.ts` | register MagicLink methods |
| CREATE | `packages/api/src/auth/magiclink.ts` | Admin handler factories |
| CREATE | `packages/api/src/auth/magiclink.spec.ts` | Unit tests |
| MODIFY | `packages/api/src/auth/index.ts` | re-export |
| CREATE | `api/server/routes/admin/magic-links.js` | Admin CRUD route |
| MODIFY | `api/server/routes/index.js` | export adminMagicLinks |
| MODIFY | `api/server/index.js` | mount /api/admin/magic-links |
| MODIFY | `api/server/routes/auth.js` | GET /magic-link login route |
| MODIFY | `packages/data-provider/src/api-endpoints.ts` | endpoint helpers |
| MODIFY | `packages/data-provider/src/keys.ts` | QueryKeys + MutationKeys |
| MODIFY | `packages/data-provider/src/data-service.ts` | API call functions |
| MODIFY | `packages/data-provider/src/types/queries.ts` | MagicLink types |
| CREATE | `client/src/data-provider/MagicLinks/queries.ts` | useGetMagicLinksQuery |
| CREATE | `client/src/data-provider/MagicLinks/mutations.ts` | create + revoke mutations |
| CREATE | `client/src/data-provider/MagicLinks/index.ts` | re-exports |
| MODIFY | `client/src/data-provider/index.ts` | export MagicLinks hooks |
| CREATE | `client/src/components/MagicLinks/MagicLinksView.tsx` | page layout |
| CREATE | `client/src/components/MagicLinks/MagicLinkTable.tsx` | table + revoke |
| CREATE | `client/src/components/MagicLinks/CreateMagicLinkModal.tsx` | email input dialog |
| CREATE | `client/src/components/MagicLinks/index.ts` | re-exports |
| MODIFY | `client/src/routes/Dashboard.tsx` | add /d/magic-links route |
| MODIFY | `client/src/locales/en/translation.json` | com_ui_magic_link_* keys |

---

## Task 1: MagicLink schema and TypeScript types

**Files:**
- Create: `packages/data-schemas/src/schema/magiclink.ts`
- Create: `packages/data-schemas/src/types/magiclink.ts`

- [ ] **Step 1: Create the type file**

```typescript
// packages/data-schemas/src/types/magiclink.ts
import { Document, Types } from 'mongoose';

export interface IMagicLink extends Document {
  token: string;
  email: string;
  createdBy: Types.ObjectId;
  active: boolean;
  userId?: Types.ObjectId;
  createdAt: Date;
  lastUsedAt?: Date;
  useCount: number;
  tenantId?: string;
}

export interface MagicLinkCreateData {
  token: string;
  email: string;
  createdBy: Types.ObjectId | string;
  tenantId?: string;
}

export interface MagicLinkView {
  id: string;
  email: string;
  active: boolean;
  useCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  userId?: string;
}
```

- [ ] **Step 2: Create the schema file**

```typescript
// packages/data-schemas/src/schema/magiclink.ts
import { Schema } from 'mongoose';
import type { IMagicLink } from '~/types';

const magicLinkSchema: Schema<IMagicLink> = new Schema({
  token: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'user' },
  active: { type: Boolean, default: true },
  userId: { type: Schema.Types.ObjectId, ref: 'user' },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date },
  useCount: { type: Number, default: 0 },
  tenantId: { type: String, index: true },
});

magicLinkSchema.index({ token: 1 }, { unique: true });
magicLinkSchema.index({ email: 1, tenantId: 1 }, { unique: true });
magicLinkSchema.index({ createdBy: 1 });

export default magicLinkSchema;
```

- [ ] **Step 3: Commit**

```bash
git add packages/data-schemas/src/schema/magiclink.ts packages/data-schemas/src/types/magiclink.ts
git commit -m "feat: add MagicLink schema and TypeScript types"
```

---

## Task 2: MagicLink model and methods factories

**Files:**
- Create: `packages/data-schemas/src/models/magiclink.ts`
- Create: `packages/data-schemas/src/methods/magiclink.ts`

- [ ] **Step 1: Create the model factory**

```typescript
// packages/data-schemas/src/models/magiclink.ts
import magicLinkSchema from '~/schema/magiclink';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createMagicLinkModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(magicLinkSchema);
  return (
    mongoose.models.MagicLink ||
    mongoose.model<t.IMagicLink>('MagicLink', magicLinkSchema)
  );
}
```

- [ ] **Step 2: Create the methods factory**

```typescript
// packages/data-schemas/src/methods/magiclink.ts
import type { Types } from 'mongoose';
import type { IMagicLink, MagicLinkCreateData } from '~/types';

export function createMagicLinkMethods(mongoose: typeof import('mongoose')) {
  async function createMagicLink(data: MagicLinkCreateData): Promise<IMagicLink> {
    const MagicLink = mongoose.models.MagicLink as import('mongoose').Model<IMagicLink>;
    return await MagicLink.create(data);
  }

  async function findMagicLink(
    query: Partial<{ token: string; email: string; active: boolean; _id: Types.ObjectId | string }>,
  ): Promise<IMagicLink | null> {
    const MagicLink = mongoose.models.MagicLink as import('mongoose').Model<IMagicLink>;
    return await MagicLink.findOne(query).lean();
  }

  async function findMagicLinkById(id: string): Promise<IMagicLink | null> {
    const MagicLink = mongoose.models.MagicLink as import('mongoose').Model<IMagicLink>;
    return await MagicLink.findById(id).lean();
  }

  async function updateMagicLink(
    id: string,
    update: Partial<Pick<IMagicLink, 'active' | 'userId' | 'useCount' | 'lastUsedAt'>>,
  ): Promise<IMagicLink | null> {
    const MagicLink = mongoose.models.MagicLink as import('mongoose').Model<IMagicLink>;
    return await MagicLink.findByIdAndUpdate(id, update, { new: true }).lean();
  }

  async function listMagicLinks(filter: {
    createdBy?: string | Types.ObjectId;
  }): Promise<IMagicLink[]> {
    const MagicLink = mongoose.models.MagicLink as import('mongoose').Model<IMagicLink>;
    return await MagicLink.find(filter).lean();
  }

  return { createMagicLink, findMagicLink, findMagicLinkById, updateMagicLink, listMagicLinks };
}

export type MagicLinkMethods = ReturnType<typeof createMagicLinkMethods>;
```

- [ ] **Step 3: Commit**

```bash
git add packages/data-schemas/src/models/magiclink.ts packages/data-schemas/src/methods/magiclink.ts
git commit -m "feat: add MagicLink model and methods factories"
```

---

## Task 3: Wire up data-schemas registrations

**Files:**
- Modify: `packages/data-schemas/src/schema/index.ts`
- Modify: `packages/data-schemas/src/types/index.ts`
- Modify: `packages/data-schemas/src/models/index.ts`
- Modify: `packages/data-schemas/src/methods/index.ts`

- [ ] **Step 1: Export from schema/index.ts**

Add to `packages/data-schemas/src/schema/index.ts`:
```typescript
export { default as magicLinkSchema } from './magiclink';
```

- [ ] **Step 2: Export from types/index.ts**

Add to `packages/data-schemas/src/types/index.ts`:
```typescript
export * from './magiclink';
```

- [ ] **Step 3: Register in models/index.ts**

In `packages/data-schemas/src/models/index.ts`, add the import at the top (after existing imports):
```typescript
import { createMagicLinkModel } from './magiclink';
```

Add `MagicLink: createMagicLinkModel(mongoose),` to the object returned by `createModels`.

- [ ] **Step 4: Register in methods/index.ts**

In `packages/data-schemas/src/methods/index.ts`, add the import:
```typescript
import { createMagicLinkMethods, type MagicLinkMethods } from './magiclink';
```

Add `MagicLinkMethods` to the `AllMethods` type union:
```typescript
export type AllMethods = /* existing types */ & MagicLinkMethods;
```

In the `createMethods` function body, spread in the magic link methods:
```typescript
...createMagicLinkMethods(mongoose),
```

- [ ] **Step 5: Commit**

```bash
git add packages/data-schemas/src/schema/index.ts packages/data-schemas/src/types/index.ts \
  packages/data-schemas/src/models/index.ts packages/data-schemas/src/methods/index.ts
git commit -m "feat: register MagicLink in data-schemas"
```

---

## Task 4: Backend service — admin handler factories

**Files:**
- Create: `packages/api/src/auth/magiclink.ts`
- Modify: `packages/api/src/auth/index.ts`

- [ ] **Step 1: Create the handler factory file**

```typescript
// packages/api/src/auth/magiclink.ts
import { Types } from 'mongoose';
import { hashToken, getRandomValues, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { IMagicLink, MagicLinkView } from '@librechat/data-schemas';

export interface MagicLinkDeps {
  createMagicLink: (data: {
    token: string;
    email: string;
    createdBy: Types.ObjectId | string;
    tenantId?: string;
  }) => Promise<IMagicLink>;
  findMagicLink: (
    query: Partial<{ token: string; email: string; active: boolean }>,
  ) => Promise<IMagicLink | null>;
  findMagicLinkById: (id: string) => Promise<IMagicLink | null>;
  updateMagicLink: (
    id: string,
    update: Partial<Pick<IMagicLink, 'active' | 'userId' | 'useCount' | 'lastUsedAt'>>,
  ) => Promise<IMagicLink | null>;
  listMagicLinks: (filter: { createdBy?: string | Types.ObjectId }) => Promise<IMagicLink[]>;
}

function toView(link: IMagicLink): MagicLinkView {
  return {
    id: (link._id as Types.ObjectId).toString(),
    email: link.email,
    active: link.active,
    useCount: link.useCount,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    userId: link.userId?.toString(),
  };
}

export function createMagicLinkHandlers(deps: MagicLinkDeps) {
  async function generate(req: Request, res: Response): Promise<void> {
    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ message: 'Valid email is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await deps.findMagicLink({ email: normalizedEmail, active: true });
    if (existing) {
      res.status(409).json({ message: 'An active magic link already exists for this email' });
      return;
    }

    const rawToken = await getRandomValues(32);
    const hash = await hashToken(rawToken);
    const link = await deps.createMagicLink({
      token: hash,
      email: normalizedEmail,
      createdBy: (req.user as { _id: Types.ObjectId })._id,
    });

    res.status(201).json({
      ...toView(link),
      url: `/auth/magic-link?token=${rawToken}`,
    });
  }

  async function revoke(req: Request, res: Response): Promise<void> {
    const link = await deps.findMagicLinkById(req.params.id);
    if (!link) {
      res.status(404).json({ message: 'Magic link not found' });
      return;
    }
    await deps.updateMagicLink(req.params.id, { active: false });
    res.status(204).send();
  }

  async function list(req: Request, res: Response): Promise<void> {
    const links = await deps.listMagicLinks({
      createdBy: (req.user as { _id: Types.ObjectId })._id,
    });
    res.json(links.map(toView));
  }

  return { generate, revoke, list };
}
```

- [ ] **Step 2: Re-export from auth/index.ts**

Add to `packages/api/src/auth/index.ts`:
```typescript
export * from './magiclink';
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/auth/magiclink.ts packages/api/src/auth/index.ts
git commit -m "feat: add MagicLink admin handler factories"
```

---

## Task 5: Write and run backend unit tests

**Files:**
- Create: `packages/api/src/auth/magiclink.spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// packages/api/src/auth/magiclink.spec.ts
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { createMagicLinkHandlers } from './magiclink';
import type { IMagicLink } from '@librechat/data-schemas';

jest.mock('@librechat/data-schemas', () => ({
  hashToken: jest.fn((s: string) => Promise.resolve(`hash:${s}`)),
  getRandomValues: jest.fn(() => Promise.resolve('randomhex')),
  logger: { error: jest.fn(), debug: jest.fn() },
}));

function makeLink(overrides: Partial<IMagicLink> = {}): IMagicLink {
  return {
    _id: new Types.ObjectId(),
    token: 'hash:randomhex',
    email: 'student@test.com',
    createdBy: new Types.ObjectId(),
    active: true,
    useCount: 0,
    createdAt: new Date(),
    ...overrides,
  } as unknown as IMagicLink;
}

function makeRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { _id: new Types.ObjectId() },
    body: {},
    params: {},
    ...overrides,
  };
}

describe('createMagicLinkHandlers', () => {
  const adminId = new Types.ObjectId();

  describe('generate', () => {
    it('returns 400 when email is missing', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: {} });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when email format is invalid', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: { email: 'notanemail' } });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 409 when active link already exists for email', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn().mockResolvedValue(makeLink()),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: { email: 'student@test.com' } });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('creates link and returns 201 with url when email is new', async () => {
      const link = makeLink();
      const deps = {
        createMagicLink: jest.fn().mockResolvedValue(link),
        findMagicLink: jest.fn().mockResolvedValue(null),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { generate } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId }, body: { email: 'student@test.com' } });
      const res = makeRes();
      await generate(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(201);
      expect((res.json as jest.Mock).mock.calls[0][0]).toHaveProperty('url');
    });
  });

  describe('revoke', () => {
    it('returns 404 when link not found', async () => {
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn().mockResolvedValue(null),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn(),
      };
      const { revoke } = createMagicLinkHandlers(deps);
      const req = makeReq({ params: { id: 'nonexistent' } });
      const res = makeRes();
      await revoke(req as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sets active=false and returns 204 when link exists', async () => {
      const link = makeLink();
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn().mockResolvedValue(link),
        updateMagicLink: jest.fn().mockResolvedValue({ ...link, active: false }),
        listMagicLinks: jest.fn(),
      };
      const { revoke } = createMagicLinkHandlers(deps);
      const req = makeReq({ params: { id: link._id.toString() } });
      const res = makeRes();
      await revoke(req as Request, res as Response);
      expect(deps.updateMagicLink).toHaveBeenCalledWith(link._id.toString(), { active: false });
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('list', () => {
    it('returns all links for the requesting admin', async () => {
      const links = [makeLink(), makeLink({ email: 'other@test.com' })];
      const deps = {
        createMagicLink: jest.fn(),
        findMagicLink: jest.fn(),
        findMagicLinkById: jest.fn(),
        updateMagicLink: jest.fn(),
        listMagicLinks: jest.fn().mockResolvedValue(links),
      };
      const { list } = createMagicLinkHandlers(deps);
      const req = makeReq({ user: { _id: adminId } });
      const res = makeRes();
      await list(req as Request, res as Response);
      expect(deps.listMagicLinks).toHaveBeenCalledWith({ createdBy: adminId });
      expect((res.json as jest.Mock).mock.calls[0][0]).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they pass**

```bash
cd packages/api && npx jest src/auth/magiclink.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add packages/api/src/auth/magiclink.spec.ts
git commit -m "test: add MagicLink handler unit tests"
```

---

## Task 6: Admin JS route and server mounting

**Files:**
- Create: `api/server/routes/admin/magic-links.js`
- Modify: `api/server/routes/index.js`
- Modify: `api/server/index.js`

- [ ] **Step 1: Create the admin route file**

```javascript
// api/server/routes/admin/magic-links.js
const express = require('express');
const { createMagicLinkHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const handlers = createMagicLinkHandlers({
  createMagicLink: db.createMagicLink,
  findMagicLink: db.findMagicLink,
  findMagicLinkById: db.findMagicLinkById,
  updateMagicLink: db.updateMagicLink,
  listMagicLinks: db.listMagicLinks,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', handlers.list);
router.post('/', handlers.generate);
router.delete('/:id', handlers.revoke);

module.exports = router;
```

- [ ] **Step 2: Export from routes/index.js**

Open `api/server/routes/index.js`. Add beside the existing admin route exports:
```javascript
const adminMagicLinks = require('./admin/magic-links');
```

Add `adminMagicLinks` to `module.exports`.

- [ ] **Step 3: Mount in server/index.js**

Open `api/server/index.js`. Find the block where other admin routes are mounted (around line 155-158):
```javascript
app.use('/api/admin', routes.adminAuth);
app.use('/api/admin/config', routes.adminConfig);
app.use('/api/admin/groups', routes.adminGroups);
app.use('/api/admin/roles', routes.adminRoles);
```

Add:
```javascript
app.use('/api/admin/magic-links', routes.adminMagicLinks);
```

- [ ] **Step 4: Commit**

```bash
git add api/server/routes/admin/magic-links.js api/server/routes/index.js api/server/index.js
git commit -m "feat: add admin magic-links route and mount in server"
```

---

## Task 7: Magic link login route (GET /api/auth/magic-link)

**Files:**
- Modify: `api/server/routes/auth.js`

- [ ] **Step 1: Add the login route**

Open `api/server/routes/auth.js`. At the top, ensure `hashToken` is imported from `@librechat/data-schemas`. Add this import if not already present:
```javascript
const { hashToken } = require('@librechat/data-schemas');
```

Add the logger import if not present:
```javascript
const { logger } = require('~/config/winston');
```

Add these requires near the top with other service imports:
```javascript
const { setAuthTokens } = require('~/server/services/AuthService');
const db = require('~/models');
```

Add the login route (before `module.exports`):
```javascript
router.get('/magic-link', async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.redirect('/login?error=invalid_magic_link');
  }
  try {
    const hash = await hashToken(token);
    const link = await db.findMagicLink({ token: hash, active: true });
    if (!link) {
      return res.redirect('/login?error=invalid_magic_link');
    }

    let user;
    if (link.userId) {
      user = await db.findUser({ _id: link.userId });
    } else {
      user = await db.findUser({ email: link.email });
      if (!user) {
        user = await db.createUser(
          {
            email: link.email,
            provider: 'magic_link',
            role: 'USER',
            emailVerified: true,
            name: link.email.split('@')[0],
          },
          undefined,
          true,
          true,
        );
      }
      await db.updateMagicLink(link._id.toString(), { userId: user._id });
    }

    if (!user) {
      return res.redirect('/login?error=invalid_magic_link');
    }

    await db.updateMagicLink(link._id.toString(), {
      useCount: (link.useCount ?? 0) + 1,
      lastUsedAt: new Date(),
    });

    await setAuthTokens(user._id.toString(), res);
    return res.redirect('/');
  } catch (err) {
    logger.error('[magic-link login]', err);
    return res.redirect('/login?error=invalid_magic_link');
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add api/server/routes/auth.js
git commit -m "feat: add GET /api/auth/magic-link login route"
```

---

## Task 8: Data-provider types, endpoints, keys, and service

**Files:**
- Modify: `packages/data-provider/src/types/queries.ts`
- Modify: `packages/data-provider/src/api-endpoints.ts`
- Modify: `packages/data-provider/src/keys.ts`
- Modify: `packages/data-provider/src/data-service.ts`

- [ ] **Step 1: Add types to types/queries.ts**

Add to `packages/data-provider/src/types/queries.ts`:
```typescript
export interface TMagicLink {
  id: string;
  email: string;
  active: boolean;
  useCount: number;
  lastUsedAt?: string;
  createdAt: string;
  userId?: string;
}

export interface TCreateMagicLink {
  email: string;
}

export interface TCreateMagicLinkResponse extends TMagicLink {
  url: string;
}
```

- [ ] **Step 2: Add endpoints to api-endpoints.ts**

Add to `packages/data-provider/src/api-endpoints.ts`:
```typescript
export const magicLinks = () => `${BASE_URL}/api/admin/magic-links`;
export const magicLink = (id: string) => `${BASE_URL}/api/admin/magic-links/${encodeURIComponent(id)}`;
```

- [ ] **Step 3: Add keys to keys.ts**

In `packages/data-provider/src/keys.ts`, add to `QueryKeys` enum:
```typescript
magicLinks = 'magicLinks',
```

Add to `MutationKeys` enum:
```typescript
createMagicLink = 'createMagicLink',
revokeMagicLink = 'revokeMagicLink',
```

- [ ] **Step 4: Add data service functions to data-service.ts**

Add to `packages/data-provider/src/data-service.ts`:
```typescript
export const getMagicLinks = (): Promise<t.TMagicLink[]> =>
  request.get(endpoints.magicLinks());

export const createMagicLink = (data: t.TCreateMagicLink): Promise<t.TCreateMagicLinkResponse> =>
  request.post(endpoints.magicLinks(), data);

export const revokeMagicLink = (id: string): Promise<void> =>
  request.delete(endpoints.magicLink(id));
```

- [ ] **Step 5: Build data-provider**

From the project root:
```bash
npm run build:data-provider
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/data-provider/src/types/queries.ts packages/data-provider/src/api-endpoints.ts \
  packages/data-provider/src/keys.ts packages/data-provider/src/data-service.ts
git commit -m "feat: add magic link types, endpoints, keys, and data-service"
```

---

## Task 9: Frontend data hooks

**Files:**
- Create: `client/src/data-provider/MagicLinks/queries.ts`
- Create: `client/src/data-provider/MagicLinks/mutations.ts`
- Create: `client/src/data-provider/MagicLinks/index.ts`
- Modify: `client/src/data-provider/index.ts`

- [ ] **Step 1: Create queries.ts**

```typescript
// client/src/data-provider/MagicLinks/queries.ts
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';

export const useGetMagicLinksQuery = () =>
  useQuery({
    queryKey: [QueryKeys.magicLinks],
    queryFn: () => dataService.getMagicLinks(),
  });
```

- [ ] **Step 2: Create mutations.ts**

```typescript
// client/src/data-provider/MagicLinks/mutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type { TCreateMagicLink, TCreateMagicLinkResponse } from 'librechat-data-provider';

export const useCreateMagicLinkMutation = (options?: {
  onSuccess?: (data: TCreateMagicLinkResponse) => void;
  onError?: (error: unknown) => void;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.createMagicLink],
    mutationFn: (data: TCreateMagicLink) => dataService.createMagicLink(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.magicLinks] });
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
};

export const useRevokeMagicLinkMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.revokeMagicLink],
    mutationFn: (id: string) => dataService.revokeMagicLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.magicLinks] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
};
```

- [ ] **Step 3: Create index.ts**

```typescript
// client/src/data-provider/MagicLinks/index.ts
export * from './queries';
export * from './mutations';
```

- [ ] **Step 4: Re-export from client/src/data-provider/index.ts**

Add to `client/src/data-provider/index.ts`:
```typescript
export * from './MagicLinks';
```

- [ ] **Step 5: Commit**

```bash
git add client/src/data-provider/MagicLinks/ client/src/data-provider/index.ts
git commit -m "feat: add MagicLinks React Query hooks"
```

---

## Task 10: Localization keys

**Files:**
- Modify: `client/src/locales/en/translation.json`

- [ ] **Step 1: Add keys**

Open `client/src/locales/en/translation.json`. Add these entries in the appropriate alphabetical position among `com_ui_*` keys:

```json
"com_ui_magic_links": "Magic Links",
"com_ui_magic_link_generate": "Generate Magic Link",
"com_ui_magic_link_email_placeholder": "student@example.com",
"com_ui_magic_link_generated": "Magic link generated",
"com_ui_magic_link_copy": "Copy link",
"com_ui_magic_link_copied": "Copied!",
"com_ui_magic_link_revoke": "Revoke",
"com_ui_magic_link_revoke_confirm": "Revoke this magic link?",
"com_ui_magic_link_active": "Active",
"com_ui_magic_link_revoked": "Revoked",
"com_ui_magic_link_uses": "Uses",
"com_ui_magic_link_last_used": "Last used",
"com_ui_magic_link_created": "Created",
"com_ui_magic_link_no_links": "No magic links yet. Generate one to get started.",
"com_ui_magic_link_email_label": "Student email address"
```

- [ ] **Step 2: Commit**

```bash
git add client/src/locales/en/translation.json
git commit -m "feat: add magic link localization keys"
```

---

## Task 11: UI components

**Files:**
- Create: `client/src/components/MagicLinks/CreateMagicLinkModal.tsx`
- Create: `client/src/components/MagicLinks/MagicLinkTable.tsx`
- Create: `client/src/components/MagicLinks/MagicLinksView.tsx`
- Create: `client/src/components/MagicLinks/index.ts`

- [ ] **Step 1: Create CreateMagicLinkModal.tsx**

```tsx
// client/src/components/MagicLinks/CreateMagicLinkModal.tsx
import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { Button, Input, Label, OGDialog, OGDialogContent, OGDialogTitle } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useCreateMagicLinkMutation } from '~/data-provider';

interface CreateMagicLinkModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateMagicLinkModal({ open, onClose }: CreateMagicLinkModalProps) {
  const localize = useLocalize();
  const [email, setEmail] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { mutate, isLoading, error } = useCreateMagicLinkMutation({
    onSuccess: (data) => setGeneratedUrl(data.url),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate({ email });
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(window.location.origin + generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setEmail('');
    setGeneratedUrl(null);
    setCopied(false);
    onClose();
  };

  return (
    <OGDialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <OGDialogContent className="max-w-md">
        <OGDialogTitle>{localize('com_ui_magic_link_generate')}</OGDialogTitle>
        {generatedUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{localize('com_ui_magic_link_generated')}</p>
            <div className="flex items-center gap-2 rounded border border-border-light bg-surface-secondary p-2">
              <code className="flex-1 truncate text-xs">{window.location.origin + generatedUrl}</code>
              <Button variant="ghost" size="icon" onClick={handleCopy} aria-label={localize('com_ui_magic_link_copy')}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-text-secondary">Account will be created on first use.</p>
            <Button onClick={handleClose} className="w-full">
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="magic-link-email">{localize('com_ui_magic_link_email_label')}</Label>
              <Input
                id="magic-link-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={localize('com_ui_magic_link_email_placeholder')}
                required
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-red-500">
                {(error as { message?: string }).message ?? 'Failed to generate link'}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? 'Generating…' : localize('com_ui_magic_link_generate')}
              </Button>
            </div>
          </form>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
```

- [ ] **Step 2: Create MagicLinkTable.tsx**

```tsx
// client/src/components/MagicLinks/MagicLinkTable.tsx
import { useState } from 'react';
import { Link2Off } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useRevokeMagicLinkMutation } from '~/data-provider';
import type { TMagicLink } from 'librechat-data-provider';

interface MagicLinkTableProps {
  links: TMagicLink[];
}

export default function MagicLinkTable({ links }: MagicLinkTableProps) {
  const localize = useLocalize();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { mutate: revoke, isLoading } = useRevokeMagicLinkMutation({
    onSuccess: () => setConfirmId(null),
  });

  if (links.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        {localize('com_ui_magic_link_no_links')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-light text-left text-text-secondary">
            <th className="pb-2 pr-4 font-medium">Email</th>
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_active')}</th>
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_uses')}</th>
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_last_used')}</th>
            <th className="pb-2 font-medium">{localize('com_ui_magic_link_created')}</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id} className="border-b border-border-light">
              <td className="py-3 pr-4 font-mono text-xs">{link.email}</td>
              <td className="py-3 pr-4">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    link.active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {link.active
                    ? localize('com_ui_magic_link_active')
                    : localize('com_ui_magic_link_revoked')}
                </span>
              </td>
              <td className="py-3 pr-4">{link.useCount}</td>
              <td className="py-3 pr-4 text-text-secondary">
                {link.lastUsedAt ? new Date(link.lastUsedAt).toLocaleDateString() : '—'}
              </td>
              <td className="py-3 pr-4 text-text-secondary">
                {new Date(link.createdAt).toLocaleDateString()}
              </td>
              <td className="py-3">
                {link.active && (
                  <>
                    {confirmId === link.id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => revoke(link.id)}
                        >
                          Confirm
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmId(link.id)}
                        aria-label={localize('com_ui_magic_link_revoke')}
                      >
                        <Link2Off className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create MagicLinksView.tsx**

```tsx
// client/src/components/MagicLinks/MagicLinksView.tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGetMagicLinksQuery } from '~/data-provider';
import MagicLinkTable from './MagicLinkTable';
import CreateMagicLinkModal from './CreateMagicLinkModal';

export default function MagicLinksView() {
  const localize = useLocalize();
  const [modalOpen, setModalOpen] = useState(false);
  const { data: links = [], isLoading, error } = useGetMagicLinksQuery();

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_ui_magic_links')}
        </h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {localize('com_ui_magic_link_generate')}
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading && (
          <p className="text-sm text-text-secondary">Loading…</p>
        )}
        {error && (
          <p className="text-sm text-red-500">Failed to load magic links.</p>
        )}
        {!isLoading && !error && <MagicLinkTable links={links} />}
      </div>

      <CreateMagicLinkModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Create index.ts**

```typescript
// client/src/components/MagicLinks/index.ts
export { default as MagicLinksView } from './MagicLinksView';
export { default as MagicLinkTable } from './MagicLinkTable';
export { default as CreateMagicLinkModal } from './CreateMagicLinkModal';
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MagicLinks/
git commit -m "feat: add MagicLinks UI components"
```

---

## Task 12: Dashboard route registration

**Files:**
- Modify: `client/src/routes/Dashboard.tsx`

- [ ] **Step 1: Add the route**

Open `client/src/routes/Dashboard.tsx`. Add the import at the top with the other component imports:
```typescript
import { MagicLinksView } from '~/components/MagicLinks';
```

In the `dashboardRoutes` children array, add before the `path: '*'` catch-all:
```typescript
{
  path: 'magic-links',
  element: <MagicLinksView />,
},
```

- [ ] **Step 2: Commit**

```bash
git add client/src/routes/Dashboard.tsx
git commit -m "feat: add /d/magic-links dashboard route"
```

---

## Task 13: Final build and smoke test

- [ ] **Step 1: Build data-provider**

```bash
npm run build:data-provider
```

Expected: no TypeScript errors.

- [ ] **Step 2: Start backend**

```bash
npm run backend:dev
```

Expected: server starts on port 3080 with no errors.

- [ ] **Step 3: Start frontend**

In a second terminal:
```bash
npm run frontend:dev
```

Expected: Vite starts on port 3090.

- [ ] **Step 4: Smoke test the admin flow**

1. Log in as admin at `http://localhost:3090`
2. Navigate to `http://localhost:3090/d/magic-links`
3. Click "Generate Magic Link", enter a student email, submit
4. Copy the generated URL
5. Open the URL in a private window — you should be logged in as the new student and redirected to `/`
6. Repeat opening the link — you should still be logged in (reusable)
7. Back in admin: revoke the link
8. Try the link again — you should be redirected to `/login?error=invalid_magic_link`

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -p  # stage only intentional changes
git commit -m "chore: post-integration cleanup for magic link feature"
```
