# LibreChat Data Schemas Package

This package provides the database schemas, models, types, and methods for LibreChat using Mongoose ODM.

## 📁 Package Structure

```
packages/data-schemas/
├── src/
│   ├── schema/         # Mongoose schema definitions
│   ├── models/         # Model factory functions
│   ├── types/          # TypeScript type definitions
│   ├── methods/        # Database operation methods
│   ├── common/         # Shared constants and enums
│   ├── config/         # Configuration files (winston, etc.)
│   └── index.ts        # Main package exports
```

## 🏗️ Architecture Patterns

### 1. Schema Files (`src/schema/`)

Schema files define the Mongoose schema structure. They follow these conventions:

- **Naming**: Use lowercase filenames (e.g., `user.ts`, `accessRole.ts`)
- **Imports**: Import types from `~/types` for TypeScript support
- **Exports**: Export only the schema as default

**Example:**
```typescript
import { Schema } from 'mongoose';
import type { IUser } from '~/types';

const userSchema = new Schema<IUser>(
  {
    name: { type: String },
    email: { type: String, required: true },
    // ... other fields
  },
  { timestamps: true }
);

export default userSchema;
```

### 2. Type Definitions (`src/types/`)

Type files define TypeScript interfaces and types. They follow these conventions:

- **Base Type**: Define a plain type without Mongoose Document properties
- **Document Interface**: Extend the base type with Document and `_id`
- **Enums/Constants**: Place related enums in the type file or `common/` if shared

**Example:**
```typescript
import type { Document, Types } from 'mongoose';

export type User = {
  name?: string;
  email: string;
  // ... other fields
};

export type IUser = User &
  Document & {
    _id: Types.ObjectId;
  };
```

### 3. Model Factory Functions (`src/models/`)

Model files create Mongoose models using factory functions. They follow these conventions:

- **Function Name**: `create[EntityName]Model`
- **Singleton Pattern**: Check if model exists before creating
- **Type Safety**: Use the corresponding interface from types

**Example:**
```typescript
import userSchema from '~/schema/user';
import type * as t from '~/types';

export function createUserModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);
}
```

### 4. Database Methods (`src/methods/`)

Method files contain database operations for each entity. They follow these conventions:

- **Function Name**: `create[EntityName]Methods`
- **Return Type**: Export a type for the methods object
- **Operations**: Include CRUD operations and entity-specific queries

**Example:**
```typescript
import type { Model } from 'mongoose';
import type { IUser } from '~/types';

export function createUserMethods(mongoose: typeof import('mongoose')) {
  async function findUserById(userId: string): Promise<IUser | null> {
    const User = mongoose.models.User as Model<IUser>;
    return await User.findById(userId).lean();
  }

  async function createUser(userData: Partial<IUser>): Promise<IUser> {
    const User = mongoose.models.User as Model<IUser>;
    return await User.create(userData);
  }

  return {
    findUserById,
    createUser,
    // ... other methods
  };
}

export type UserMethods = ReturnType<typeof createUserMethods>;
```

### 5. Main Exports (`src/index.ts`)

The main index file exports:
- `createModels()` - Factory function for all models
- `createMethods()` - Factory function for all methods
- Type exports from `~/types`
- Shared utilities and constants

## 🚀 Adding a New Entity

To add a new entity to the data-schemas package, follow these steps:

### Step 1: Create the Type Definition

Create `src/types/[entityName].ts`:

```typescript
import type { Document, Types } from 'mongoose';

export type EntityName = {
  /** Field description */
  fieldName: string;
  // ... other fields
};

export type IEntityName = EntityName &
  Document & {
    _id: Types.ObjectId;
  };
```

### Step 2: Update Types Index

Add to `src/types/index.ts`:

```typescript
export * from './entityName';
```

### Step 3: Create the Schema

Create `src/schema/[entityName].ts`:

```typescript
import { Schema } from 'mongoose';
import type { IEntityName } from '~/types';

const entityNameSchema = new Schema<IEntityName>(
  {
    fieldName: { type: String, required: true },
    // ... other fields
  },
  { timestamps: true }
);

export default entityNameSchema;
```

### Step 4: Create the Model Factory

Create `src/models/[entityName].ts`:

```typescript
import entityNameSchema from '~/schema/entityName';
import type * as t from '~/types';

export function createEntityNameModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.EntityName || 
    mongoose.model<t.IEntityName>('EntityName', entityNameSchema)
  );
}
```

### Step 5: Update Models Index

Add to `src/models/index.ts`:

1. Import the factory function:
```typescript
import { createEntityNameModel } from './entityName';
```

2. Add to the return object in `createModels()`:
```typescript
EntityName: createEntityNameModel(mongoose),
```

### Step 6: Create Database Methods

Create `src/methods/[entityName].ts`:

```typescript
import type { Model, Types } from 'mongoose';
import type { IEntityName } from '~/types';

export function createEntityNameMethods(mongoose: typeof import('mongoose')) {
  async function findEntityById(id: string | Types.ObjectId): Promise<IEntityName | null> {
    const EntityName = mongoose.models.EntityName as Model<IEntityName>;
    return await EntityName.findById(id).lean();
  }

  // ... other methods

  return {
    findEntityById,
    // ... other methods
  };
}

export type EntityNameMethods = ReturnType<typeof createEntityNameMethods>;
```

### Step 7: Update Methods Index

Add to `src/methods/index.ts`:

1. Import the methods:
```typescript
import { createEntityNameMethods, type EntityNameMethods } from './entityName';
```

2. Add to the return object in `createMethods()`:
```typescript
...createEntityNameMethods(mongoose),
```

3. Add to the `AllMethods` type:
```typescript
export type AllMethods = UserMethods &
  // ... other methods
  EntityNameMethods;
```

## 📝 Best Practices

1. **Consistent Naming**: Use lowercase for filenames, PascalCase for types/interfaces
2. **Type Safety**: Always use TypeScript types, avoid `any`
3. **JSDoc Comments**: Document complex fields and methods
4. **Indexes**: Define database indexes in schema files for query performance
5. **Validation**: Use Mongoose schema validation for data integrity
6. **Lean Queries**: Use `.lean()` for read operations when you don't need Mongoose document methods

## 🔧 Common Patterns

### Enums and Constants

Place shared enums in `src/common/`:

```typescript
// src/common/permissions.ts
export enum PermissionBits {
  VIEW = 1,
  EDIT = 2,
  DELETE = 4,
  SHARE = 8,
}
```

### Compound Indexes

For complex queries, add compound indexes:

```typescript
schema.index({ field1: 1, field2: 1 });
schema.index(
  { uniqueField: 1 },
  { 
    unique: true, 
    partialFilterExpression: { uniqueField: { $exists: true } }
  }
);
```

### Virtual Properties

Add computed properties using virtuals:

```typescript
schema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});
```

## 🧪 Testing

When adding new entities, ensure:
- Types compile without errors
- Models can be created successfully
- Methods handle edge cases (null checks, validation)
- Indexes are properly defined for query patterns

## 📚 Resources

- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [MongoDB Indexes](https://docs.mongodb.com/manual/indexes/) 