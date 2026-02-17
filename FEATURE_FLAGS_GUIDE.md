# Feature Flags System - Complete Guide

## 📋 Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [How It Works](#how-it-works)
4. [Adding New Features](#adding-new-features)
5. [Adding New Businesses](#adding-new-businesses)
6. [Using Feature Flags](#using-feature-flags)
7. [Security & Best Practices](#security--best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Examples](#examples)

---

## Overview

The jamot-chat platform uses a **business-based feature flag system** to enable/disable features for different business deployments. Instead of managing individual feature flags in environment variables, features are automatically loaded based on a single `BUSINESS_NAME` environment variable.

### Key Benefits
- ✅ **Simple**: One environment variable controls all features
- ✅ **Type-Safe**: TypeScript constants prevent configuration errors
- ✅ **Maintainable**: Features defined in code, version controlled
- ✅ **Scalable**: Easy to add new businesses and features
- ✅ **Consistent**: Single source of truth for backend and frontend

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Environment Variable                      │
│                    BUSINESS_NAME=jamot                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Business Constants (Single Source)              │
│   api/constants/businesses.js (Backend)                      │
│   client/src/constants/businesses.ts (Frontend)              │
│                                                               │
│   JAMOT: {                                                    │
│     defaultFeatures: ['social-media', 'audit']               │
│   }                                                           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐
    │  Backend           │   │  Frontend          │
    │  FeatureService    │   │  useFeatureFlag    │
    │  Middleware        │   │  FeatureGuard      │
    └───────────────────┘   └───────────────────┘
                │                       │
                ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐
    │  Route Loading     │   │  UI Rendering      │
    │  API Protection    │   │  Conditional Views │
    └───────────────────┘   └───────────────────┘
```

### File Structure

```
jamot-chat/
├── api/
│   ├── constants/
│   │   └── businesses.js           # Backend business registry
│   └── server/
│       ├── services/
│       │   └── FeatureService.js   # Feature resolution logic
│       ├── middleware/
│       │   └── featureGuard.js     # Route protection
│       └── index.js                # Conditional route loading
└── client/
    └── src/
        ├── constants/
        │   └── businesses.ts        # Frontend business registry
        ├── hooks/
        │   └── useFeatureFlag.ts    # React hook for features
        └── components/
            └── Guards/
                └── FeatureGuard.tsx # Component-level protection
```

---

## How It Works

### 1. Business Configuration

All businesses and their features are defined in two matching files:

**Backend: `api/constants/businesses.js`**
```javascript
const BUSINESSES = {
  SCAFFAD: {
    name: 'scaffad',
    displayName: 'Scaffad',
    defaultFeatures: ['audit', 'social-media', 'user-management'],
    description: 'Full-featured deployment',
  },
  JAMOT: {
    name: 'jamot',
    displayName: 'Jamot',
    defaultFeatures: ['social-media', 'financial-analytics', 'audit'],
    description: 'Standard deployment',
  },
};

const AVAILABLE_FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
};

module.exports = { BUSINESSES, AVAILABLE_FEATURES };
```

**Frontend: `client/src/constants/businesses.ts`**
```typescript
export const BUSINESSES = {
  SCAFFAD: {
    name: 'scaffad',
    displayName: 'Scaffad',
    description: 'Full-featured deployment',
  },
  JAMOT: {
    name: 'jamot',
    displayName: 'Jamot',
    description: 'Standard deployment',
  },
} as const;

export const FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
} as const;
```

### 2. Environment Configuration

Set one environment variable in your `.env` file:

```bash
# Choose one of: scaffad, jamot, generic
BUSINESS_NAME=jamot
```

### 3. Backend Feature Resolution

**`api/server/services/FeatureService.js`**
```javascript
const { BUSINESSES } = require('../../constants/businesses');

class FeatureService {
  static getBusinessName() {
    return process.env.BUSINESS_NAME || 'generic';
  }

  static getBusinessConfig() {
    const businessName = this.getBusinessName();
    return Object.values(BUSINESSES).find(b => b.name === businessName) || null;
  }

  static getEnabledFeatures() {
    const config = this.getBusinessConfig();
    return config?.defaultFeatures || [];
  }

  static isFeatureEnabled(featureName) {
    return this.getEnabledFeatures().includes(featureName);
  }
}

module.exports = FeatureService;
```

### 4. Backend Route Protection

**`api/server/middleware/featureGuard.js`**
```javascript
const FeatureService = require('../services/FeatureService');

const requireFeature = (featureName) => {
  return (req, res, next) => {
    if (!FeatureService.isFeatureEnabled(featureName)) {
      return res.status(403).json({ 
        error: 'Feature not available',
        feature: featureName,
        business: FeatureService.getBusinessName()
      });
    }
    next();
  };
};

module.exports = { requireFeature };
```

**Usage in `api/server/index.js`**
```javascript
const FeatureService = require('./services/FeatureService');
const { requireFeature } = require('./middleware/featureGuard');

// Conditional route loading
if (FeatureService.isFeatureEnabled('audit')) {
  const auditRoutes = require('./routes/auditAdmin');
  app.use(
    '/api/admin/audits',
    requireJwtAuth,
    requireCEORole,
    requireFeature('audit'),
    auditRoutes
  );
  console.log('[OK] Audit routes loaded');
} else {
  console.log('[SKIP] Audit routes disabled');
}
```

### 5. Frontend Feature Detection

**`client/src/hooks/useFeatureFlag.ts`**
```typescript
import { useGetStartupConfig } from '~/data-provider';
import type { FeatureName } from '~/constants/businesses';

export const useFeatureFlag = (featureName: FeatureName) => {
  const { data: config, isLoading, error } = useGetStartupConfig();
  
  const isEnabled = config?.enabledFeatures?.includes(featureName) ?? false;
  const businessName = config?.businessName;
  const businessDisplayName = config?.businessDisplayName;

  return {
    isEnabled,
    businessName,
    businessDisplayName,
    isLoading,
    error,
  };
};

export const useAllFeatureFlags = () => {
  const { data: config, isLoading, error } = useGetStartupConfig();
  
  return {
    features: config?.enabledFeatures || [],
    businessName: config?.businessName,
    businessDisplayName: config?.businessDisplayName,
    isLoading,
    error,
  };
};
```

### 6. Frontend Component Protection

**`client/src/components/Guards/FeatureGuard.tsx`**
```typescript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import type { FeatureName } from '~/constants/businesses';

interface FeatureGuardProps {
  feature: FeatureName;
  children: React.ReactNode;
  redirectTo?: string;
  fallback?: React.ReactNode;
}

export const FeatureGuard: React.FC<FeatureGuardProps> = ({ 
  feature, 
  children, 
  redirectTo = '/',
  fallback = null 
}) => {
  const { isEnabled, isLoading } = useFeatureFlag(feature);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isEnabled) {
    return fallback ? <>{fallback}</> : <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};
```

---

## Adding New Features

### Step 1: Define the Feature

**Backend: `api/constants/businesses.js`**
```javascript
const AVAILABLE_FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
  NEW_FEATURE: 'new-feature', // ✅ Add here
};
```

**Frontend: `client/src/constants/businesses.ts`**
```typescript
export const FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
  NEW_FEATURE: 'new-feature', // ✅ Add here
} as const;
```

### Step 2: Add Feature to Business(es)

**Backend: `api/constants/businesses.js`**
```javascript
const BUSINESSES = {
  SCAFFAD: {
    name: 'scaffad',
    displayName: 'Scaffad',
    defaultFeatures: [
      'audit', 
      'social-media', 
      'user-management',
      'new-feature' // ✅ Add to desired businesses
    ],
  },
};
```

### Step 3: Protect Backend Routes

**`api/server/index.js`**
```javascript
if (FeatureService.isFeatureEnabled('new-feature')) {
  const newFeatureRoutes = require('./routes/newFeature');
  app.use(
    '/api/new-feature',
    requireJwtAuth,
    requireFeature('new-feature'), // ✅ Add middleware
    newFeatureRoutes
  );
}
```

### Step 4: Use in Frontend

**Conditional Rendering:**
```typescript
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import { FEATURES } from '~/constants/businesses';

function MyComponent() {
  const { isEnabled } = useFeatureFlag(FEATURES.NEW_FEATURE);

  return (
    <div>
      {isEnabled && (
        <button>New Feature Button</button>
      )}
    </div>
  );
}
```

**With FeatureGuard:**
```typescript
import { FeatureGuard } from '~/components/Guards';
import { FEATURES } from '~/constants/businesses';

function MyRoute() {
  return (
    <FeatureGuard feature={FEATURES.NEW_FEATURE}>
      <NewFeatureComponent />
    </FeatureGuard>
  );
}
```

---

## Adding New Businesses

### Step 1: Define Business Configuration

**Backend: `api/constants/businesses.js`**
```javascript
const BUSINESSES = {
  SCAFFAD: { /* existing */ },
  JAMOT: { /* existing */ },
  NEW_COMPANY: { // ✅ Add new business
    name: 'new-company',
    displayName: 'New Company',
    defaultFeatures: ['social-media', 'audit'],
    description: 'Custom deployment for New Company',
  },
};
```

**Frontend: `client/src/constants/businesses.ts`**
```typescript
export const BUSINESSES = {
  SCAFFAD: { /* existing */ },
  JAMOT: { /* existing */ },
  NEW_COMPANY: { // ✅ Add new business
    name: 'new-company',
    displayName: 'New Company',
    description: 'Custom deployment for New Company',
  },
} as const;
```

### Step 2: Deploy with New Business

**`.env` file:**
```bash
BUSINESS_NAME=new-company
```

### Step 3: Restart and Verify

```bash
# Backend logs should show:
[Feature Config] Business: new-company (New Company)
[Feature Config] Enabled Features: social-media, audit
```

---

## Using Feature Flags

### Backend Usage

#### Check if Feature is Enabled
```javascript
const FeatureService = require('../services/FeatureService');

if (FeatureService.isFeatureEnabled('audit')) {
  // Load audit functionality
}
```

#### Get All Enabled Features
```javascript
const features = FeatureService.getEnabledFeatures();
// ['social-media', 'audit', 'user-management']
```

#### Get Business Info
```javascript
const businessName = FeatureService.getBusinessName(); // 'jamot'
const config = FeatureService.getBusinessConfig();
// { name: 'jamot', displayName: 'Jamot', defaultFeatures: [...] }
```

#### Protect Routes
```javascript
const { requireFeature } = require('./middleware/featureGuard');

router.get('/api/analytics', 
  requireJwtAuth,
  requireFeature('financial-analytics'), // ✅ Feature guard
  analyticsController.getAnalytics
);
```

### Frontend Usage

#### Hook: Check Single Feature
```typescript
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import { FEATURES } from '~/constants/businesses';

function AnalyticsButton() {
  const { isEnabled, isLoading } = useFeatureFlag(FEATURES.FINANCIAL_ANALYTICS);

  if (isLoading) return <Spinner />;
  if (!isEnabled) return null;

  return <button>View Analytics</button>;
}
```

#### Hook: Get All Features
```typescript
import { useAllFeatureFlags } from '~/hooks/useFeatureFlag';

function FeatureList() {
  const { features, businessName, isLoading } = useAllFeatureFlags();

  if (isLoading) return <Spinner />;

  return (
    <div>
      <h2>{businessName}</h2>
      <ul>
        {features.map(feature => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </div>
  );
}
```

#### Component Guard: Protect Routes
```typescript
import { FeatureGuard } from '~/components/Guards';
import { FEATURES } from '~/constants/businesses';

function AuditRoute() {
  return (
    <FeatureGuard 
      feature={FEATURES.AUDIT}
      redirectTo="/dashboard"
    >
      <AuditManagementPage />
    </FeatureGuard>
  );
}
```

#### Component Guard: With Fallback
```typescript
<FeatureGuard 
  feature={FEATURES.AUDIT}
  fallback={<div>Audit feature not available</div>}
>
  <AuditContent />
</FeatureGuard>
```

#### Conditional Tab/Menu Items
```typescript
function CEODashboard() {
  const { isEnabled: isAuditEnabled } = useFeatureFlag(FEATURES.AUDIT);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects' },
    ...(isAuditEnabled ? [{ id: 'audit', label: 'Audit' }] : []),
  ];

  return <Tabs tabs={tabs} />;
}
```

---

## Security & Best Practices

### 1. Multi-Layer Security

Always use multiple layers of protection for sensitive features:

```javascript
// Backend route protection
app.use(
  '/api/admin/audits',
  requireJwtAuth,           // Layer 1: Authentication
  requireCEORole,           // Layer 2: Authorization
  requireFeature('audit'),  // Layer 3: Feature flag
  auditRoutes
);
```

### 2. Frontend Protection is Not Security

Frontend feature flags are for **UX only**, not security:

```typescript
// ❌ BAD: Relying only on frontend
function SecretData() {
  const { isEnabled } = useFeatureFlag(FEATURES.ADMIN);
  if (!isEnabled) return null;
  return <div>{secretData}</div>; // Data still in bundle!
}

// ✅ GOOD: Backend enforces security
function SecretData() {
  const { isEnabled } = useFeatureFlag(FEATURES.ADMIN);
  const { data } = useSecretData(); // API call protected by backend
  if (!isEnabled) return null;
  return <div>{data}</div>;
}
```

### 3. Keep Constants in Sync

Backend and frontend constants must match:

```javascript
// Backend
AVAILABLE_FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
};

// Frontend (must match!)
FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
};
```

**Pro tip:** Create a script to validate synchronization:

```javascript
// scripts/validate-features.js
const backendFeatures = require('../api/constants/businesses').AVAILABLE_FEATURES;
const frontendFeatures = require('../client/src/constants/businesses').FEATURES;

// Compare and report mismatches
```

### 4. Log Feature Configuration

Always log feature config on startup:

```javascript
// api/server/index.js
FeatureService.logStartupConfig();
// [Feature Config] Business: jamot (Jamot)
// [Feature Config] Enabled Features: social-media, audit
```

### 5. Use TypeScript for Type Safety

```typescript
// ✅ Type-safe feature names
const { isEnabled } = useFeatureFlag(FEATURES.AUDIT);

// ❌ Error: typo caught at compile time
const { isEnabled } = useFeatureFlag('auditt'); // TypeScript error!
```

### 6. Document Feature Dependencies

If features depend on each other, document it:

```javascript
const BUSINESSES = {
  SCAFFAD: {
    defaultFeatures: [
      'user-management',  // Required by 'audit'
      'audit',
    ],
  },
};
```

---

## Troubleshooting

### Problem: Feature not showing in UI

**Check 1: Verify business name**
```bash
# .env file
BUSINESS_NAME=jamot  # Must match exactly (lowercase)
```

**Check 2: Verify feature is in business config**
```javascript
// api/constants/businesses.js
JAMOT: {
  defaultFeatures: ['social-media', 'audit'], // ✅ 'audit' included
}
```

**Check 3: Restart backend**
```bash
cd api
npm run dev
```

**Check 4: Check browser console**
```javascript
// Open DevTools Console
console.log(window.__STARTUP_CONFIG__);
// Should show: { enabledFeatures: ['social-media', 'audit'] }
```

**Check 5: Hard refresh browser**
```
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

### Problem: Backend returns "Feature not available"

**Check 1: Backend logs**
```bash
# Should show:
[Feature Config] Enabled Features: social-media, audit
[Feature Config] Audit routes: LOADED
```

**Check 2: Environment variable**
```bash
# Verify in .env
echo $BUSINESS_NAME
# or
node -e "console.log(process.env.BUSINESS_NAME)"
```

**Check 3: Route protection**
```javascript
// Ensure route has requireFeature middleware
app.use('/api/admin/audits', requireFeature('audit'), auditRoutes);
```

### Problem: Features not syncing between backend/frontend

**Solution: Check /api/config endpoint**
```bash
curl http://localhost:3080/api/config
# Should return:
{
  "businessName": "jamot",
  "businessDisplayName": "Jamot",
  "enabledFeatures": ["social-media", "audit"]
}
```

### Problem: TypeScript errors on feature names

**Solution: Rebuild types**
```bash
cd client
npm run build
# or
npm run type-check
```

---

## Examples

### Example 1: Feature-Based Navigation

```typescript
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import { FEATURES } from '~/constants/businesses';

function Sidebar() {
  const { isEnabled: hasAudit } = useFeatureFlag(FEATURES.AUDIT);
  const { isEnabled: hasAnalytics } = useFeatureFlag(FEATURES.FINANCIAL_ANALYTICS);
  const { isEnabled: hasUserMgmt } = useFeatureFlag(FEATURES.USER_MANAGEMENT);

  return (
    <nav>
      <NavLink to="/">Home</NavLink>
      <NavLink to="/projects">Projects</NavLink>
      
      {hasAudit && (
        <NavLink to="/audit">🔍 Audit</NavLink>
      )}
      
      {hasAnalytics && (
        <NavLink to="/analytics">📊 Analytics</NavLink>
      )}
      
      {hasUserMgmt && (
        <NavLink to="/users">👥 User Management</NavLink>
      )}
    </nav>
  );
}
```

### Example 2: Feature-Based API Calls

```typescript
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import { useQuery } from '@tanstack/react-query';
import { FEATURES } from '~/constants/businesses';

function Dashboard() {
  const { isEnabled: hasAnalytics } = useFeatureFlag(FEATURES.FINANCIAL_ANALYTICS);

  // Only fetch analytics if feature enabled
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics'],
    queryFn: fetchAnalytics,
    enabled: hasAnalytics, // ✅ Conditional fetching
  });

  return (
    <div>
      <h1>Dashboard</h1>
      
      {hasAnalytics && analyticsData && (
        <AnalyticsChart data={analyticsData} />
      )}
    </div>
  );
}
```

### Example 3: Feature-Based Permissions

```typescript
function UserActions({ user }) {
  const { isEnabled: hasUserMgmt } = useFeatureFlag(FEATURES.USER_MANAGEMENT);

  return (
    <div>
      <button onClick={() => viewUser(user)}>View</button>
      
      {hasUserMgmt && (
        <>
          <button onClick={() => editUser(user)}>Edit</button>
          <button onClick={() => deleteUser(user)}>Delete</button>
        </>
      )}
    </div>
  );
}
```

### Example 4: Business-Specific Branding

```typescript
import { useAllFeatureFlags } from '~/hooks/useFeatureFlag';

function Header() {
  const { businessDisplayName } = useAllFeatureFlags();

  return (
    <header>
      <h1>{businessDisplayName} Platform</h1>
      {/* Shows "Jamot Platform" or "Scaffad Platform" */}
    </header>
  );
}
```

### Example 5: Feature Migration

```javascript
// Gradually roll out a feature

// Step 1: Add to one business
JAMOT: {
  defaultFeatures: ['social-media', 'new-feature'], // ✅ Testing
}

// Step 2: Monitor and fix issues

// Step 3: Add to other businesses
SCAFFAD: {
  defaultFeatures: ['social-media', 'new-feature'], // ✅ Rolled out
}
```

---

## Feature Flag Checklist

When implementing a new feature with flags:

- [ ] Add feature name to `AVAILABLE_FEATURES` (backend)
- [ ] Add feature name to `FEATURES` (frontend)
- [ ] Add feature to desired business `defaultFeatures`
- [ ] Implement backend route protection with `requireFeature`
- [ ] Implement frontend guards with `useFeatureFlag` or `FeatureGuard`
- [ ] Add startup logging for the feature
- [ ] Document feature dependencies
- [ ] Test with feature enabled
- [ ] Test with feature disabled
- [ ] Verify security (backend enforcement)
- [ ] Update deployment documentation

---

## Summary

### Core Concepts

1. **One Variable**: `BUSINESS_NAME` controls all features
2. **Single Source**: Constants files define all configurations
3. **Type Safety**: TypeScript prevents configuration errors
4. **Security**: Backend enforces, frontend enhances UX
5. **Consistency**: Backend and frontend must match

### Quick Commands

```bash
# Set business
echo "BUSINESS_NAME=jamot" >> .env

# Restart backend
cd api && npm run dev

# Check configuration
curl http://localhost:3080/api/config

# Verify in browser console
window.__STARTUP_CONFIG__.enabledFeatures
```

### Key Files

```
api/constants/businesses.js              # Backend registry
api/server/services/FeatureService.js    # Backend logic
api/server/middleware/featureGuard.js    # Backend protection
client/src/constants/businesses.ts       # Frontend registry
client/src/hooks/useFeatureFlag.ts       # Frontend hook
client/src/components/Guards/FeatureGuard.tsx  # Frontend guard
```

---

## Resources

- **Implementation Examples**: See `client/src/components/Profile/CEODashboard.tsx`
- **API Documentation**: See `AUDIT_PLATFORM_API_SETUP.md`
- **Testing Guide**: See `AUDIT_IMPLEMENTATION_TESTING.md`
- **Quick Start**: See `QUICK_START_AUDIT.md`

---

**Questions or Issues?**
- Check backend startup logs for feature configuration
- Verify `.env` has correct `BUSINESS_NAME`
- Ensure backend and frontend constants match
- Test with different business names to isolate issues

---

**Last Updated**: 2026-02-16  
**Version**: 1.0.0  
**Maintained by**: Development Team
