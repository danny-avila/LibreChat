# Pending Group Membership by Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to add users to groups by email before they log in; memberships are silently resolved when the user first authenticates via OpenID.

**Architecture:** `pendingEmails: string[]` is stored on each Group document. On email-add, if the user isn't found in the DB the email goes into `pendingEmails` instead of returning an error. On OpenID login, a new helper `resolvePendingMemberships` finds all groups that contain the user's email in `pendingEmails`, adds the user to those groups, and removes the email atomically.

**Tech Stack:** MongoDB/Mongoose, Express (JS), Passport OpenID strategy, React/TypeScript frontend. Tests run with Jest (`cd api && npx jest <pattern>`).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/data-schemas/src/types/group.ts` | Modify | Add `pendingEmails?: string[]` to `IGroup` |
| `packages/data-schemas/src/schema/group.ts` | Modify | Add `pendingEmails` Mongoose field |
| `api/models/Group.js` | Modify | Add `resolvePendingMemberships` + `removePendingEmail` + export |
| `api/models/index.js` | Modify | Re-export the two new functions |
| `api/server/controllers/GroupController.js` | Modify | Update `addUserToGroupHandler`; add `removePendingEmailHandler` |
| `api/server/routes/groups.js` | Modify | Register `DELETE /:id/pending/:email` |
| `api/strategies/openidStrategy.js` | Modify | Call `resolvePendingMemberships` after `updateUser` |
| `client/src/components/Groups/GroupMembersSection.tsx` | Modify | Show pending emails section; handle `pending: true` response |

---

## Task 1: Add `pendingEmails` to the Group type and schema

**Files:**
- Modify: `packages/data-schemas/src/types/group.ts`
- Modify: `packages/data-schemas/src/schema/group.ts`

- [ ] **Step 1: Add `pendingEmails` to the `IGroup` interface**

Open `packages/data-schemas/src/types/group.ts`. Find the `IGroup` interface (line 19). Add the field after `memberCount`:

```ts
export interface IGroup extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  email?: string;
  avatar?: string;
  memberIds?: string[];
  source: 'local' | 'entra';
  idOnTheSource?: string;
  tenantId?: string;
  isActive: boolean;
  timeWindows: ITimeWindow[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  memberCount: number;
  pendingEmails: string[];
  createdAt?: Date;
  updatedAt?: Date;

  // Methods
  updateMemberCount(): Promise<IGroup>;
}
```

- [ ] **Step 2: Add `pendingEmails` field to the Mongoose schema**

Open `packages/data-schemas/src/schema/group.ts`. After the `memberCount` field definition (around line 138), add:

```ts
pendingEmails: {
  type: [String],
  default: [],
  lowercase: true,
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/pajgrtondrej/Work/GitHub/LibreChat && npx tsc -p packages/data-schemas/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/data-schemas/src/types/group.ts packages/data-schemas/src/schema/group.ts
git commit -m "feat: add pendingEmails field to Group schema and IGroup type"
```

---

## Task 2: Add `resolvePendingMemberships` and `removePendingEmail` to Group model

**Files:**
- Modify: `api/models/Group.js` (around line 586 — after `removeUserFromGroup`, before `module.exports`)

- [ ] **Step 1: Add `resolvePendingMemberships` function**

Insert before `module.exports` in `api/models/Group.js`:

```js
/**
 * Resolve pending email memberships for a user who just logged in.
 * Finds all groups that have this email in pendingEmails, adds the user
 * to each group, and removes the email from pendingEmails.
 * Errors are caught per-group so one failure does not block the rest.
 *
 * @param {string} email - The user's email address (will be lowercased)
 * @param {string} userId - The user's MongoDB ObjectId string
 */
const resolvePendingMemberships = async (email, userId) => {
  if (!email || !userId) return;
  const normalizedEmail = email.toLowerCase();
  try {
    const { Group } = require('../db/models');
    if (!Group) return;
    const groups = await Group.find({ pendingEmails: normalizedEmail }).lean();
    if (!groups.length) return;
    for (const group of groups) {
      try {
        await addUserToGroup(group._id.toString(), userId, userId);
        await Group.findByIdAndUpdate(group._id, { $pull: { pendingEmails: normalizedEmail } });
        logger.info(`[resolvePendingMemberships] Added ${email} to group ${group.name}`);
      } catch (err) {
        logger.error(`[resolvePendingMemberships] Failed to resolve group ${group._id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`[resolvePendingMemberships] Outer error: ${err.message}`);
  }
};

/**
 * Remove a pending email from a group.
 * @param {string} groupId - Group ID
 * @param {string} email - Email to remove (case-insensitive)
 */
const removePendingEmail = async (groupId, email) => {
  const { Group } = require('../db/models');
  await Group.findByIdAndUpdate(groupId, { $pull: { pendingEmails: email.toLowerCase() } });
};
```

- [ ] **Step 2: Export the new functions**

Find `module.exports` at the bottom of `api/models/Group.js` and add both exports:

```js
module.exports = {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addTimeWindow,
  updateTimeWindow,
  removeTimeWindow,
  getUserGroups,
  getGroupStats,
  getAvailableUsers,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
  resolvePendingMemberships,
  removePendingEmail,
};
```

- [ ] **Step 3: Write a test for `resolvePendingMemberships`**

Create `api/tests/models/resolvePendingMemberships.test.js`:

```js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('resolvePendingMemberships', () => {
  it('does nothing when no pending groups exist', async () => {
    const { resolvePendingMemberships } = require('../../models/Group');
    await expect(resolvePendingMemberships('nobody@trivium.cz', 'userId123')).resolves.toBeUndefined();
  });

  it('returns early when email is empty', async () => {
    const { resolvePendingMemberships } = require('../../models/Group');
    await expect(resolvePendingMemberships('', 'userId123')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the test**

```bash
cd /Users/pajgrtondrej/Work/GitHub/LibreChat/api && npx jest resolvePendingMemberships --no-coverage
```

Expected: 2 tests pass.

- [ ] **Step 5: Re-export from `api/models/index.js`**

Open `api/models/index.js`. Add to the destructure from `./Group`:

```js
const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addTimeWindow,
  updateTimeWindow,
  removeTimeWindow,
  getUserGroups,
  getGroupStats,
  getAvailableUsers,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
  resolvePendingMemberships,
  removePendingEmail,
} = require('./Group');
```

And add both names to `module.exports`:

```js
module.exports = {
  ...methods,
  seedDatabase,
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addTimeWindow,
  updateTimeWindow,
  removeTimeWindow,
  getUserGroups,
  getGroupStats,
  getAvailableUsers,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
  resolvePendingMemberships,
  removePendingEmail,
};
```

- [ ] **Step 6: Commit**

```bash
git add api/models/Group.js api/models/index.js api/tests/models/resolvePendingMemberships.test.js
git commit -m "feat: add resolvePendingMemberships and removePendingEmail to Group model"
```

---

## Task 3: Update `addUserToGroupHandler` to store pending email

**Files:**
- Modify: `api/server/controllers/GroupController.js`

The current handler (added in a previous session) returns 404 when the user is not found by email. Replace that block so it instead stores the email as pending.

- [ ] **Step 1: Replace the "user not found" block in `addUserToGroupHandler`**

Find this block in `api/server/controllers/GroupController.js`:

```js
    if (!userId && email) {
      const models = require('~/db/models');
      const user = await models.User.findOne({ email: { $regex: new RegExp(`^${email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }, { _id: 1 }).lean();
      if (!user) {
        return res.status(404).json({
          success: false,
          message: `No account found for ${email}. The user must log in at least once before being added.`,
        });
      }
      userId = user._id.toString();
    }
```

Replace with:

```js
    if (!userId && email) {
      const models = require('~/db/models');
      const normalizedEmail = email.trim().toLowerCase();
      const user = await models.User.findOne(
        { email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { _id: 1 },
      ).lean();
      if (!user) {
        // User hasn't logged in yet — store email as pending
        await models.Group.findByIdAndUpdate(id, { $addToSet: { pendingEmails: normalizedEmail } });
        return res.status(200).json({
          success: true,
          pending: true,
          message: `${email} will be added automatically when they log in for the first time.`,
        });
      }
      userId = user._id.toString();
    }
```

- [ ] **Step 2: Also handle the "already a member" case cleanly**

Find the catch block that re-throws `'User is already a member of this group'`:

```js
    if (error.message.includes('User is already a member')) {
```

Add this case right before the generic 500, if not already present:

```js
    if (error.message.includes('already a member')) {
      return res.status(200).json({
        success: true,
        message: 'User is already a member of this group',
      });
    }
```

- [ ] **Step 3: Commit**

```bash
git add api/server/controllers/GroupController.js
git commit -m "feat: store pending email on group when user not yet registered"
```

---

## Task 4: Add `removePendingEmailHandler` and register the route

**Files:**
- Modify: `api/server/controllers/GroupController.js`
- Modify: `api/server/routes/groups.js`

- [ ] **Step 1: Add the handler to `GroupController.js`**

At the top of `GroupController.js`, add `removePendingEmail` to the existing import from `~/models`:

```js
const {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  getAvailableUsers,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
  removePendingEmail,
} = require('~/models');
```

Then add the handler before `module.exports`:

```js
/**
 * Remove a pending email from a group
 */
const removePendingEmailHandler = async (req, res) => {
  try {
    const { id, email } = req.params;
    await removePendingEmail(id, decodeURIComponent(email));
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error removing pending email:', error);
    res.status(500).json({ success: false, message: 'Failed to remove pending email' });
  }
};
```

- [ ] **Step 2: Export `removePendingEmailHandler`**

Find `module.exports` in `GroupController.js` and add:

```js
module.exports = {
  // ... existing exports ...
  removePendingEmailHandler,
};
```

- [ ] **Step 3: Register the route in `api/server/routes/groups.js`**

Import the new handler at the top where the other handlers are destructured:

```js
const {
  // ... existing ...
  removePendingEmailHandler,
} = require('~/server/controllers/GroupController');
```

Add the route after the existing member routes:

```js
router.delete('/:id/pending/:email', removePendingEmailHandler);
```

- [ ] **Step 4: Commit**

```bash
git add api/server/controllers/GroupController.js api/server/routes/groups.js
git commit -m "feat: add removePendingEmailHandler and DELETE pending email route"
```

---

## Task 5: Hook `resolvePendingMemberships` into the OpenID login strategy

**Files:**
- Modify: `api/strategies/openidStrategy.js`

The hook point is right after `user = await updateUser(user._id, user)` (around line 697). This runs for both new and returning users on every login.

- [ ] **Step 1: Import `resolvePendingMemberships` at the top of `openidStrategy.js`**

Find the existing `require` calls near the top of the file (around line 1-50). Add:

```js
const { resolvePendingMemberships } = require('~/models');
```

- [ ] **Step 2: Call `resolvePendingMemberships` after `updateUser`**

Find this line (around line 697):

```js
  user = await updateUser(user._id, user);
```

Add immediately after it:

```js
  await resolvePendingMemberships(email, user._id.toString());
```

- [ ] **Step 3: Verify no syntax errors**

```bash
node --check /Users/pajgrtondrej/Work/GitHub/LibreChat/api/strategies/openidStrategy.js
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add api/strategies/openidStrategy.js
git commit -m "feat: resolve pending group memberships on OpenID login"
```

---

## Task 6: Update the frontend to show pending emails

**Files:**
- Modify: `client/src/components/Groups/GroupMembersSection.tsx`

- [ ] **Step 1: Add state and fetch for pending emails**

In `GroupMembersSection.tsx`, add to the existing state declarations:

```tsx
const [pendingEmails, setPendingEmails] = useState<string[]>([]);
```

Add a `fetchPendingEmails` function alongside `fetchMembers`:

```tsx
const fetchPendingEmails = async () => {
  try {
    const response = await fetch(`http://localhost:3081/api/groups/${groupId}`);
    const data = await response.json();
    if (data.success) {
      setPendingEmails(data.data?.pendingEmails ?? []);
    }
  } catch {
    // non-critical — pending section stays empty
  }
};
```

Call it in the `useEffect` alongside `fetchMembers`:

```tsx
useEffect(() => {
  if (groupId) {
    fetchMembers();
    fetchAvailableUsers();
    fetchPendingEmails();
  }
}, [groupId]);
```

- [ ] **Step 2: Refetch pending emails after adding by email**

In `handleAddByEmail`, update the success branch:

```tsx
if (data.success) {
  if (data.pending) {
    await fetchPendingEmails();
  } else {
    await fetchMembers();
  }
  setEmailInput('');
}
```

- [ ] **Step 3: Add `handleRemovePendingEmail` function**

Add before `handleRemoveMember`:

```tsx
const handleRemovePendingEmail = async (email: string) => {
  try {
    await fetch(`http://localhost:3081/api/groups/${groupId}/pending/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
    setPendingEmails((prev) => prev.filter((e) => e !== email));
  } catch {
    // silent
  }
};
```

- [ ] **Step 4: Render the pending emails section**

Add this block after the "Add Member Section" (`{showAddMember && ...}`) and before "Current Members List":

```tsx
{pendingEmails.length > 0 && (
  <div className="rounded-lg border border-border-light bg-surface-primary">
    <div className="border-b border-border-light px-3 py-2">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        Pending — will be added on first login
      </p>
    </div>
    <div className="divide-y divide-border-light">
      {pendingEmails.map((email) => (
        <div
          key={email}
          className="flex items-center justify-between p-3 hover:bg-surface-hover"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-secondary text-sm font-medium text-text-secondary">
              {email.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm text-text-primary">{email}</p>
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                pending
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRemovePendingEmail(email)}
            className="flex items-center gap-1 text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            <UserMinus className="h-4 w-4" />
            Remove
          </Button>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Groups/GroupMembersSection.tsx
git commit -m "feat: show pending email members in group management UI"
```

---

## Manual Verification Checklist

After all tasks are done, verify end-to-end:

- [ ] Add `test@trivium.cz` (not in DB) to a group → response says "will be added automatically"
- [ ] Group management UI shows the email in a "Pending" section with yellow badge
- [ ] Remove pending email → row disappears
- [ ] Add an existing user by email → added to members normally
- [ ] Simulate login: manually run `resolvePendingMemberships('test@trivium.cz', '<some-user-id>')` in a node shell → user appears in group, email removed from pendingEmails
