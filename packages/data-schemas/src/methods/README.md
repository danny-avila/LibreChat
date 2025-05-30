# Methods

This directory contains pure functions that replace the static methods from the schema files. This refactoring improves testability, type safety, and code modularity.

## Structure

- `userMethods.ts` - Functions for user operations
- `sessionMethods.ts` - Functions for session operations  
- `tokenMethods.ts` - Functions for token operations
- `index.ts` - Exports all methods for convenient importing

## Migration from Static Methods

Instead of calling static methods on models:

```typescript
// OLD: Using static methods
const user = await UserModel.findUser({ email: 'test@example.com' });
const result = await UserModel.deleteUserById(userId);
```

Use the pure functions with the model as the first parameter:

```typescript
// NEW: Using pure functions
import { findUser, deleteUserById } from '~/methods';
import UserModel from '~/schema/user';

const user = await findUser(UserModel, { email: 'test@example.com' });
const result = await deleteUserById(UserModel, userId);
```

## Benefits

1. **Pure Functions**: Methods are now side-effect free and testable
2. **Better Types**: Proper TypeScript typing throughout
3. **Dependency Injection**: Models are passed as parameters
4. **Modular**: Functions can be imported individually or as a group
5. **No Magic**: Clear explicit dependencies

## Usage Examples

### User Methods

```typescript
import { createUser, findUser, updateUser } from '~/methods';
import UserModel from '~/schema/user';

// Create a user
const newUser = await createUser(
  UserModel,
  { email: 'user@example.com', name: 'John' },
  { enabled: true, startBalance: 100 }
);

// Find a user
const user = await findUser(UserModel, { email: 'user@example.com' });

// Update a user
const updated = await updateUser(UserModel, userId, { name: 'Jane' });
```

### Session Methods

```typescript
import { createSession, findSession, deleteSession } from '~/methods';
import SessionModel from '~/schema/session';

// Create session
const { session, refreshToken } = await createSession(SessionModel, userId);

// Find session
const foundSession = await findSession(SessionModel, { refreshToken });

// Delete session
await deleteSession(SessionModel, { sessionId });
```

### Token Methods

```typescript
import { createToken, findToken, deleteTokens } from '~/methods';
import TokenModel from '~/schema/token';

// Create token
const token = await createToken(TokenModel, {
  userId,
  token: 'abc123',
  expiresIn: 3600
});

// Find token
const foundToken = await findToken(TokenModel, { token: 'abc123' });

// Delete tokens
await deleteTokens(TokenModel, { userId });
``` 