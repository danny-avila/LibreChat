# Audit Management Feature - Implementation Plan

## 📋 Overview

This document outlines the implementation plan for adding an **Audit Management page** to the CEO Dashboard with **multi-tenancy feature flag support**.

### **Goals**
1. Create standalone CEO Dashboard page for managing audit approval workflow
2. Integrate with external Audit Platform API
3. Implement constants-based feature flags for multi-business deployment
4. Ensure only authorized businesses (e.g., Scaffad) can access audit features

### **Key Requirements**
- ✅ **External API Integration**: Audit Platform API (separate domain)
- ✅ **Feature Flags**: Constants-based with single `BUSINESS_NAME` env variable
- ✅ **Access Control**: CEO profile type only
- ✅ **Multi-Tenancy**: Business-specific feature visibility via constants
- ✅ **Mobile Responsive**: Works on all screen sizes
- ✅ **No Caching**: Always fetch fresh data
- ✅ **No Real-time**: Standard HTTP requests (no WebSockets)
- ✅ **Error Handling**: Display API errors directly to user

---

## 🏗️ Architecture Overview

### **Request Flow**
```
User visits /ceo-dashboard/audit
  ↓
Frontend: FeatureGuard checks if 'audit' in ENABLED_FEATURES
  ↓
Frontend: ProfileGuard checks if user.profileType === 'ceo'
  ↓
Frontend: Renders AuditManagementPage
  ↓
Frontend: Calls /api/admin/audits
  ↓
Backend: requireJwtAuth → requireCeoProfile → requireFeature('audit')
  ↓
Backend: AuditAdminController.listAudits
  ↓
Backend: AuditAdminService.callAdminAPI (proxy to external API)
  ↓
External Audit Platform API (with Bearer token)
  ↓
Response back through chain to frontend
```

### **Multi-Tenancy Strategy**

**Simple and Clean Approach:**
- Business constants define features for each business
- Only **one environment variable** needed: `BUSINESS_NAME`
- Features automatically determined from constants

```bash
# Scaffad Deployment
BUSINESS_NAME=scaffad
# Features: audit, social-media, user-management (from constants)

# Jamot Deployment
BUSINESS_NAME=jamot
# Features: social-media, financial-analytics (from constants)

# Generic Deployment
BUSINESS_NAME=generic
# Features: social-media (from constants)
```

**Benefits:**
- ✅ No need to manage feature lists in .env
- ✅ Centralized feature management in code
- ✅ Easy to add new businesses (just update constants)
- ✅ Type-safe and validated
- ✅ Single source of truth

---

## 📁 File Structure

```
# Backend
api/
├── server/
│   ├── services/
│   │   ├── FeatureService.js              # NEW - Feature flag service
│   │   └── AuditAdminService.js           # NEW - Audit API proxy service
│   ├── controllers/
│   │   ├── ConfigController.js            # MODIFY - Add feature config endpoint
│   │   └── AuditAdminController.js        # NEW - Audit admin controller
│   ├── routes/
│   │   ├── index.js                       # MODIFY - Conditional route loading
│   │   └── auditAdmin.js                  # NEW - Audit admin routes
│   └── middleware/
│       └── featureGuard.js                # NEW - Feature guard middleware

# Frontend
client/src/
├── constants/
│   └── businesses.ts                      # NEW - Business registry
├── hooks/
│   └── useFeatureFlag.ts                  # NEW - Feature flag hook
├── components/
│   ├── Guards/
│   │   └── FeatureGuard.tsx               # NEW - Feature route guard
│   ├── Nav/
│   │   └── CeoDashboardNav.tsx            # MODIFY - Conditional menu items
│   └── Audit/                             # NEW DIRECTORY - All audit components
│       ├── index.ts                       # Exports
│       ├── AuditManagementPage.tsx        # Main page container
│       ├── AuditListView.tsx              # List view with filters
│       ├── AuditDetailView.tsx            # Detail view
│       ├── AuditEditView.tsx              # Edit form
│       ├── AuditTable.tsx                 # Data table component
│       ├── AuditFilters.tsx               # Filter controls
│       ├── AuditRow.tsx                   # Table row component
│       ├── ApprovalModal.tsx              # Approval modal
│       ├── VersionHistory.tsx             # Version history display
│       ├── PainPointsEditor.tsx           # Pain points list editor
│       ├── RecommendationsEditor.tsx      # Recommendations list editor
│       └── ROIEstimateEditor.tsx          # ROI estimate editor
├── routes/
│   └── CeoDashboardRoutes.tsx             # MODIFY - Add audit routes
├── data-provider/
│   └── audit.ts                           # NEW - Audit API client
└── types/
    └── audit.ts                           # NEW - TypeScript types

# Package updates
packages/data-provider/
└── src/
    └── audit.ts                           # NEW - Shared audit data provider

# Configuration
.env                                        # MODIFY - Add feature flags
└── ENABLED_FEATURES=audit,social-media
    BUSINESS_NAME=scaffad
    AUDIT_ADMIN_API_URL=https://audit-platform.example.com/api/admin
    ADMIN_API_SECRET=56d6e133-7574-4b46-b749-d15b4a784377
```

---

## 🔧 Implementation Phases

### **Phase 1: Backend Foundation (Feature Flags & Infrastructure)**

#### **1.1 Business Constants**
**File**: `api/constants/businesses.js`
```javascript
/**
 * Business Registry
 * Defines all supported businesses and their default features
 */
const BUSINESSES = {
  SCAFFAD: {
    name: 'scaffad',
    displayName: 'Scaffad',
    defaultFeatures: ['audit', 'social-media', 'user-management'],
    description: 'Full-featured deployment with audit management'
  },
  JAMOT: {
    name: 'jamot',
    displayName: 'Jamot',
    defaultFeatures: ['social-media', 'financial-analytics'],
    description: 'Standard deployment without audit features'
  },
  GENERIC: {
    name: 'generic',
    displayName: 'Generic',
    defaultFeatures: ['social-media'],
    description: 'Minimal feature set for generic deployments'
  }
};

// Available features across all businesses
const AVAILABLE_FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
  PROJECT_MANAGEMENT: 'project-management',
  TASK_MANAGEMENT: 'task-management'
};

module.exports = {
  BUSINESSES,
  AVAILABLE_FEATURES
};
```

#### **1.2 Feature Service**
**File**: `api/server/services/FeatureService.js`
```javascript
const { BUSINESSES, AVAILABLE_FEATURES } = require('~/constants/businesses');

class FeatureService {
  /**
   * Get business name from environment
   * @returns {string}
   */
  static getBusinessName() {
    return process.env.BUSINESS_NAME || 'jamot';
  }

  /**
   * Get business configuration from constants
   * @returns {Object|null}
   */
  static getBusinessConfig() {
    const businessName = this.getBusinessName();
    const business = Object.values(BUSINESSES).find(
      b => b.name === businessName
    );
    return business || null;
  }

  /**
   * Get enabled features from business constants
   * @returns {string[]} Array of enabled feature names
   */
  static getEnabledFeatures() {
    const businessConfig = this.getBusinessConfig();
    return businessConfig?.defaultFeatures || [];
  }

  /**
   * Check if a feature is enabled for current business
   * @param {string} featureName - Feature to check
   * @returns {boolean}
   */
  static isFeatureEnabled(featureName) {
    const enabledFeatures = this.getEnabledFeatures();
    return enabledFeatures.includes(featureName);
  }

  /**
   * Validate business name against registry
   * @returns {boolean}
   */
  static isValidBusiness() {
    const businessName = this.getBusinessName();
    return Object.values(BUSINESSES).some(b => b.name === businessName);
  }

  /**
   * Get full feature configuration for client
   * @returns {Object}
   */
  static getFeatureConfig() {
    const businessConfig = this.getBusinessConfig();
    return {
      businessName: this.getBusinessName(),
      businessDisplayName: businessConfig?.displayName || 'Unknown',
      enabledFeatures: this.getEnabledFeatures(),
      availableFeatures: Object.values(AVAILABLE_FEATURES),
      isValidBusiness: this.isValidBusiness()
    };
  }

  /**
   * Check if routes should be loaded for a feature
   * @param {string} featureName
   * @returns {boolean}
   */
  static shouldLoadRoutes(featureName) {
    return this.isFeatureEnabled(featureName);
  }

  /**
   * Log feature configuration on startup
   */
  static logStartupConfig() {
    const config = this.getFeatureConfig();
    console.log('\n=== Feature Configuration ===');
    console.log(`Business: ${config.businessDisplayName} (${config.businessName})`);
    console.log(`Enabled Features: ${config.enabledFeatures.join(', ') || 'none'}`);
    console.log(`Valid Business: ${config.isValidBusiness ? 'Yes' : 'No'}`);
    
    if (!config.isValidBusiness) {
      console.warn('⚠️  WARNING: Invalid business name! Check BUSINESS_NAME environment variable.');
      console.warn(`   Valid options: ${Object.values(BUSINESSES).map(b => b.name).join(', ')}`);
    }
    
    console.log('============================\n');
  }
}

module.exports = FeatureService;
```

#### **1.3 Feature Guard Middleware**
**File**: `api/server/middleware/featureGuard.js`
```javascript
const FeatureService = require('~/server/services/FeatureService');

/**
 * Middleware to require a specific feature to be enabled
 * @param {string} featureName - Feature to check
 * @returns {Function} Express middleware
 */
const requireFeature = (featureName) => {
  return (req, res, next) => {
    if (!FeatureService.isFeatureEnabled(featureName)) {
      const businessName = FeatureService.getBusinessName();
      return res.status(403).json({ 
        error: 'Feature not available',
        message: `The '${featureName}' feature is not enabled for ${businessName} deployment`,
        featureRequested: featureName,
        businessName: businessName
      });
    }
    next();
  };
};

/**
 * Middleware to validate business configuration
 */
const requireValidBusiness = (req, res, next) => {
  if (!FeatureService.isValidBusiness()) {
    const businessName = FeatureService.getBusinessName();
    return res.status(500).json({
      error: 'Invalid business configuration',
      message: `Business name '${businessName}' is not recognized`,
      businessName: businessName
    });
  }
  next();
};

module.exports = {
  requireFeature,
  requireValidBusiness
};
```

#### **1.4 Update Config Controller**
**File**: `api/server/controllers/ConfigController.js` (MODIFY)

Add new method:
```javascript
const FeatureService = require('~/server/services/FeatureService');

/**
 * Get feature configuration for client
 * GET /api/config/features
 */
const getFeatureConfig = (req, res) => {
  try {
    const config = FeatureService.getFeatureConfig();
    res.json(config);
  } catch (error) {
    logger.error('Failed to get feature config:', error);
    res.status(500).json({ error: 'Failed to get feature configuration' });
  }
};

module.exports = {
  // ... existing methods
  getFeatureConfig
};
```

Add route in `api/server/routes/config.js`:
```javascript
router.get('/features', ConfigController.getFeatureConfig);
```

---

### **Phase 2: Audit API Integration (Backend)**

#### **2.1 Audit Admin Service**
**File**: `api/server/services/AuditAdminService.js`
```javascript
const fetch = require('node-fetch');
const { logger } = require('~/config');

class AuditAdminService {
  constructor() {
    this.baseUrl = process.env.AUDIT_ADMIN_API_URL;
    this.apiSecret = process.env.ADMIN_API_SECRET;

    if (!this.baseUrl) {
      logger.warn('AUDIT_ADMIN_API_URL not configured');
    }
    if (!this.apiSecret) {
      logger.warn('ADMIN_API_SECRET not configured');
    }
  }

  /**
   * List all audits with optional filters
   * @param {Object} filters - Query filters
   * @returns {Promise<Object>}
   */
  async listAudits(filters = {}) {
    const queryParams = new URLSearchParams();
    
    if (filters.userId) queryParams.append('userId', filters.userId);
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.approved !== undefined) queryParams.append('approved', filters.approved);
    if (filters.limit) queryParams.append('limit', filters.limit);
    if (filters.offset) queryParams.append('offset', filters.offset);

    const url = `${this.baseUrl}/audits?${queryParams.toString()}`;
    return this.callAPI('GET', url);
  }

  /**
   * Get audit details by session ID
   * @param {string} sessionId - Audit session ID
   * @returns {Promise<Object>}
   */
  async getAuditDetails(sessionId) {
    const url = `${this.baseUrl}/audits/${sessionId}`;
    return this.callAPI('GET', url);
  }

  /**
   * Edit audit report
   * @param {string} sessionId - Audit session ID
   * @param {Object} reportData - Report content
   * @param {string} adminId - Admin identifier
   * @returns {Promise<Object>}
   */
  async editReport(sessionId, reportData, adminId) {
    const url = `${this.baseUrl}/audits/${sessionId}`;
    return this.callAPI('PUT', url, reportData, { 'X-Admin-ID': adminId });
  }

  /**
   * Approve audit report (sends email to user)
   * @param {string} sessionId - Audit session ID
   * @param {string} adminId - Admin identifier
   * @param {string} message - Optional message to user
   * @returns {Promise<Object>}
   */
  async approveReport(sessionId, adminId, message = '') {
    const url = `${this.baseUrl}/audits/${sessionId}/approve`;
    return this.callAPI('PATCH', url, { message }, { 'X-Admin-ID': adminId });
  }

  /**
   * List users with optional search
   * @param {Object} options - Search and pagination options
   * @returns {Promise<Object>}
   */
  async listUsers(options = {}) {
    const queryParams = new URLSearchParams();
    
    if (options.search) queryParams.append('search', options.search);
    if (options.limit) queryParams.append('limit', options.limit);
    if (options.offset) queryParams.append('offset', options.offset);

    const url = `${this.baseUrl}/users?${queryParams.toString()}`;
    return this.callAPI('GET', url);
  }

  /**
   * Generic API call method
   * @private
   */
  async callAPI(method, url, body = null, extraHeaders = {}) {
    try {
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiSecret}`,
          'Content-Type': 'application/json',
          ...extraHeaders
        }
      };

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
      }

      logger.info(`[AuditAPI] ${method} ${url}`);

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        logger.error(`[AuditAPI] Error ${response.status}:`, data);
        throw {
          status: response.status,
          message: data.error || data.message || 'API request failed',
          details: data
        };
      }

      return data;
    } catch (error) {
      if (error.status) {
        // Re-throw API errors
        throw error;
      }

      // Network or other errors
      logger.error('[AuditAPI] Request failed:', error);
      throw {
        status: 500,
        message: 'Failed to communicate with audit platform',
        details: error.message
      };
    }
  }
}

// Singleton instance
const auditAdminService = new AuditAdminService();

module.exports = auditAdminService;
```

#### **2.2 Audit Admin Controller**
**File**: `api/server/controllers/AuditAdminController.js`
```javascript
const auditAdminService = require('~/server/services/AuditAdminService');
const { logger } = require('~/config');

class AuditAdminController {
  /**
   * List all audits with filters
   * GET /api/admin/audits
   */
  static async listAudits(req, res) {
    try {
      const filters = {
        userId: req.query.userId,
        status: req.query.status,
        approved: req.query.approved,
        limit: req.query.limit || '50',
        offset: req.query.offset || '0'
      };

      const result = await auditAdminService.listAudits(filters);
      res.json(result);
    } catch (error) {
      logger.error('Failed to list audits:', error);
      res.status(error.status || 500).json({
        error: error.message || 'Failed to fetch audits',
        details: error.details
      });
    }
  }

  /**
   * Get audit details by ID
   * GET /api/admin/audits/:sessionId
   */
  static async getAuditDetails(req, res) {
    try {
      const { sessionId } = req.params;
      const audit = await auditAdminService.getAuditDetails(sessionId);
      res.json(audit);
    } catch (error) {
      logger.error(`Failed to get audit ${req.params.sessionId}:`, error);
      res.status(error.status || 500).json({
        error: error.message || 'Failed to fetch audit details',
        details: error.details
      });
    }
  }

  /**
   * Edit audit report
   * PUT /api/admin/audits/:sessionId
   */
  static async editReport(req, res) {
    try {
      const { sessionId } = req.params;
      const adminId = req.user.email || req.user.id;
      const reportData = req.body;

      // Validate required field
      if (!reportData.changeNotes) {
        return res.status(400).json({
          error: 'Change notes are required when editing a report'
        });
      }

      const result = await auditAdminService.editReport(
        sessionId,
        reportData,
        adminId
      );

      res.json(result);
    } catch (error) {
      logger.error(`Failed to edit report ${req.params.sessionId}:`, error);
      res.status(error.status || 500).json({
        error: error.message || 'Failed to update report',
        details: error.details
      });
    }
  }

  /**
   * Approve audit report (sends email)
   * PATCH /api/admin/audits/:sessionId/approve
   */
  static async approveReport(req, res) {
    try {
      const { sessionId } = req.params;
      const { message } = req.body;
      const adminId = req.user.email || req.user.id;

      const result = await auditAdminService.approveReport(
        sessionId,
        adminId,
        message
      );

      res.json(result);
    } catch (error) {
      logger.error(`Failed to approve report ${req.params.sessionId}:`, error);
      res.status(error.status || 500).json({
        error: error.message || 'Failed to approve report',
        details: error.details
      });
    }
  }

  /**
   * List users with search
   * GET /api/admin/audits/users
   */
  static async listUsers(req, res) {
    try {
      const options = {
        search: req.query.search,
        limit: req.query.limit || '50',
        offset: req.query.offset || '0'
      };

      const result = await auditAdminService.listUsers(options);
      res.json(result);
    } catch (error) {
      logger.error('Failed to list users:', error);
      res.status(error.status || 500).json({
        error: error.message || 'Failed to fetch users',
        details: error.details
      });
    }
  }
}

module.exports = AuditAdminController;
```

#### **2.3 Audit Admin Routes**
**File**: `api/server/routes/auditAdmin.js`
```javascript
const express = require('express');
const router = express.Router();
const AuditAdminController = require('~/server/controllers/AuditAdminController');

/**
 * GET /api/admin/audits
 * List all audits with optional filters
 */
router.get('/', AuditAdminController.listAudits);

/**
 * GET /api/admin/audits/users
 * List users with search
 */
router.get('/users', AuditAdminController.listUsers);

/**
 * GET /api/admin/audits/:sessionId
 * Get audit details
 */
router.get('/:sessionId', AuditAdminController.getAuditDetails);

/**
 * PUT /api/admin/audits/:sessionId
 * Edit audit report
 */
router.put('/:sessionId', AuditAdminController.editReport);

/**
 * PATCH /api/admin/audits/:sessionId/approve
 * Approve audit report
 */
router.patch('/:sessionId/approve', AuditAdminController.approveReport);

module.exports = router;
```

#### **2.4 Register Routes with Guards**
**File**: `api/server/routes/index.js` (MODIFY)

Add after existing route registrations:
```javascript
const FeatureService = require('~/server/services/FeatureService');
const { requireFeature } = require('~/server/middleware/featureGuard');
const { requireCeoProfile } = require('~/server/middleware/profileGuard'); // Assuming this exists

// Conditionally load audit admin routes
if (FeatureService.shouldLoadRoutes('audit')) {
  const auditAdminRoutes = require('./auditAdmin');
  router.use(
    '/admin/audits',
    requireJwtAuth,
    requireCeoProfile,
    requireFeature('audit'),
    auditAdminRoutes
  );
  console.log(`[OK] Audit admin routes loaded for ${FeatureService.getBusinessName()}`);
} else {
  console.log(`[SKIP] Audit admin routes not loaded (feature disabled)`);
}
```

#### **2.5 Update Server Startup**
**File**: `api/server/index.js` (MODIFY)

Add after Express app initialization:
```javascript
const FeatureService = require('~/server/services/FeatureService');

// Log feature configuration on startup
FeatureService.logStartupConfig();
```

---

### **Phase 3: Frontend Foundation (Feature Flags & Guards)**

#### **3.1 Business Constants**
**File**: `client/src/constants/businesses.ts`
```typescript
/**
 * Business Registry
 * Defines all supported businesses and their metadata
 */
export const BUSINESSES = {
  SCAFFAD: {
    name: 'scaffad',
    displayName: 'Scaffad',
    description: 'Full-featured deployment with audit management',
  },
  JAMOT: {
    name: 'jamot',
    displayName: 'Jamot',
    description: 'Standard deployment without audit features',
  },
  GENERIC: {
    name: 'generic',
    displayName: 'Generic',
    description: 'Minimal feature set for generic deployments',
  },
} as const;

/**
 * Available features across all businesses
 */
export const FEATURES = {
  AUDIT: 'audit',
  SOCIAL_MEDIA: 'social-media',
  USER_MANAGEMENT: 'user-management',
  FINANCIAL_ANALYTICS: 'financial-analytics',
  PROJECT_MANAGEMENT: 'project-management',
  TASK_MANAGEMENT: 'task-management',
} as const;

export type BusinessName = keyof typeof BUSINESSES;
export type FeatureName = typeof FEATURES[keyof typeof FEATURES];

/**
 * Check if business name is valid
 */
export const isValidBusiness = (name: string): boolean => {
  return Object.values(BUSINESSES).some(b => b.name === name);
};

/**
 * Get business config by name
 */
export const getBusinessConfig = (name: string) => {
  return Object.values(BUSINESSES).find(b => b.name === name) || null;
};
```

#### **3.2 Feature Flag Hook**
**File**: `client/src/hooks/useFeatureFlag.ts`
```typescript
import { useMemo } from 'react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { FeatureName } from '~/constants/businesses';

interface FeatureFlagResult {
  isEnabled: boolean;
  businessName: string;
  businessDisplayName: string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to check if a feature is enabled for current business
 * @param featureName - Feature to check
 * @returns Feature flag result with loading/error states
 */
export const useFeatureFlag = (featureName: FeatureName): FeatureFlagResult => {
  const { data: config, isLoading, error } = useGetStartupConfig();

  const result = useMemo(() => {
    const enabledFeatures = config?.enabledFeatures || [];
    const isEnabled = enabledFeatures.includes(featureName);
    const businessName = config?.businessName || 'unknown';
    const businessDisplayName = config?.businessDisplayName || 'Unknown';

    return {
      isEnabled,
      businessName,
      businessDisplayName,
    };
  }, [config, featureName]);

  return {
    ...result,
    isLoading,
    error: error as Error | null,
  };
};

/**
 * Hook to get all enabled features
 */
export const useEnabledFeatures = () => {
  const { data: config, isLoading, error } = useGetStartupConfig();

  return {
    enabledFeatures: config?.enabledFeatures || [],
    businessName: config?.businessName || 'unknown',
    businessDisplayName: config?.businessDisplayName || 'Unknown',
    isLoading,
    error: error as Error | null,
  };
};
```

#### **3.3 Feature Guard Component**
**File**: `client/src/components/Guards/FeatureGuard.tsx`
```typescript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import type { FeatureName } from '~/constants/businesses';

interface FeatureGuardProps {
  feature: FeatureName;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
  showError?: boolean;
}

/**
 * Guard component to protect routes/components based on feature flags
 */
export const FeatureGuard: React.FC<FeatureGuardProps> = ({
  feature,
  children,
  fallback = null,
  redirectTo = '/ceo-dashboard',
  showError = false,
}) => {
  const { isEnabled, isLoading, error, businessDisplayName } = useFeatureFlag(feature);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
      </div>
    );
  }

  // Error state
  if (error && showError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">
            Failed to Load Configuration
          </h2>
          <p className="text-gray-600">{error.message}</p>
        </div>
      </div>
    );
  }

  // Feature not enabled - redirect or show fallback
  if (!isEnabled) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showError) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Feature Not Available
            </h2>
            <p className="text-gray-600">
              The '{feature}' feature is not enabled for {businessDisplayName} deployment.
            </p>
          </div>
        </div>
      );
    }

    return <Navigate to={redirectTo} replace />;
  }

  // Feature enabled - render children
  return <>{children}</>;
};

/**
 * HOC version of FeatureGuard
 */
export const withFeatureGuard = (
  Component: React.ComponentType<any>,
  feature: FeatureName,
  options?: Omit<FeatureGuardProps, 'feature' | 'children'>
) => {
  return (props: any) => (
    <FeatureGuard feature={feature} {...options}>
      <Component {...props} />
    </FeatureGuard>
  );
};
```

#### **3.4 Conditional Menu Component**
**File**: `client/src/components/Nav/ConditionalMenuItem.tsx`
```typescript
import React from 'react';
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import type { FeatureName } from '~/constants/businesses';

interface ConditionalMenuItemProps {
  feature: FeatureName;
  children: React.ReactNode;
}

/**
 * Wrapper component to conditionally render menu items based on feature flags
 */
export const ConditionalMenuItem: React.FC<ConditionalMenuItemProps> = ({
  feature,
  children,
}) => {
  const { isEnabled, isLoading } = useFeatureFlag(feature);

  if (isLoading || !isEnabled) {
    return null;
  }

  return <>{children}</>;
};
```

---

### **Phase 4: Frontend - Audit Data Provider**

#### **4.1 TypeScript Types**
**File**: `client/src/types/audit.ts`
```typescript
export interface AuditSession {
  id: string;
  userId: string;
  status: 'PAID' | 'COMPLETED' | 'PROCESSED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  report?: AuditReport;
}

export interface AuditReport {
  id: string;
  sessionId: string;
  approved: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  executiveSummary: string;
  painPoints: PainPoint[];
  recommendations: Recommendation[];
  quickWins: string[];
  longTermInitiatives: string[];
  estimatedROI: EstimatedROI;
  versions?: ReportVersion[];
}

export interface PainPoint {
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  current_time_spent: string;
  business_impact: string;
}

export interface Recommendation {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  implementation_complexity: 'easy' | 'moderate' | 'complex';
  estimated_timeline: string;
  expected_impact: string;
  tools_or_approaches: string[];
}

export interface EstimatedROI {
  hours_saved: string;
  cost_equivalent: string;
  additional_notes?: string;
}

export interface ReportVersion {
  versionNumber: number;
  editedBy: string;
  editedAt: string;
  changeNotes: string;
  content: Partial<AuditReport>;
}

export interface AuditListResponse {
  audits: AuditSession[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AuditFilters {
  userId?: string;
  status?: string;
  approved?: boolean;
  limit?: number;
  offset?: number;
}

export interface UserListResponse {
  users: AuditUser[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface AuditUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  emailVerified: string | null;
  _count: {
    auditSessions: number;
  };
}

export interface ApprovalRequest {
  message?: string;
}

export interface ApprovalResponse {
  success: boolean;
  reportId: string;
  emailSent: boolean;
  message: string;
  error?: string;
}
```

#### **4.2 API Client**
**File**: `client/src/data-provider/audit.ts`
```typescript
import type {
  AuditSession,
  AuditListResponse,
  AuditFilters,
  AuditReport,
  ApprovalRequest,
  ApprovalResponse,
  UserListResponse,
} from '~/types/audit';

const BASE_URL = '/api/admin/audits';

/**
 * List audits with optional filters
 */
export const listAudits = async (filters?: AuditFilters): Promise<AuditListResponse> => {
  const params = new URLSearchParams();

  if (filters?.userId) params.append('userId', filters.userId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.approved !== undefined) params.append('approved', String(filters.approved));
  if (filters?.limit) params.append('limit', String(filters.limit));
  if (filters?.offset) params.append('offset', String(filters.offset));

  const response = await fetch(`${BASE_URL}?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch audits');
  }

  return response.json();
};

/**
 * Get audit details by session ID
 */
export const getAuditDetails = async (sessionId: string): Promise<AuditSession> => {
  const response = await fetch(`${BASE_URL}/${sessionId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch audit details');
  }

  return response.json();
};

/**
 * Edit audit report
 */
export const editReport = async (
  sessionId: string,
  reportData: Partial<AuditReport>
): Promise<{ success: boolean; reportId: string; versionNumber: number }> => {
  const response = await fetch(`${BASE_URL}/${sessionId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reportData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update report');
  }

  return response.json();
};

/**
 * Approve audit report
 */
export const approveReport = async (
  sessionId: string,
  data: ApprovalRequest
): Promise<ApprovalResponse> => {
  const response = await fetch(`${BASE_URL}/${sessionId}/approve`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to approve report');
  }

  return response.json();
};

/**
 * List users with search
 */
export const listUsers = async (
  search?: string,
  limit = 50,
  offset = 0
): Promise<UserListResponse> => {
  const params = new URLSearchParams();

  if (search) params.append('search', search);
  params.append('limit', String(limit));
  params.append('offset', String(offset));

  const response = await fetch(`${BASE_URL}/users?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch users');
  }

  return response.json();
};
```

#### **4.3 React Query Hooks**
**File**: `client/src/data-provider/audit-queries.ts`
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuditFilters, ApprovalRequest } from '~/types/audit';
import * as auditApi from './audit';

// Query keys
export const auditKeys = {
  all: ['audits'] as const,
  lists: () => [...auditKeys.all, 'list'] as const,
  list: (filters?: AuditFilters) => [...auditKeys.lists(), filters] as const,
  details: () => [...auditKeys.all, 'detail'] as const,
  detail: (id: string) => [...auditKeys.details(), id] as const,
  users: () => [...auditKeys.all, 'users'] as const,
  userList: (search?: string) => [...auditKeys.users(), search] as const,
};

/**
 * Hook to fetch audit list
 */
export const useAuditList = (filters?: AuditFilters) => {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: () => auditApi.listAudits(filters),
    staleTime: 0, // Always fetch fresh data (no caching)
    refetchOnMount: 'always',
  });
};

/**
 * Hook to fetch audit details
 */
export const useAuditDetails = (sessionId: string) => {
  return useQuery({
    queryKey: auditKeys.detail(sessionId),
    queryFn: () => auditApi.getAuditDetails(sessionId),
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

/**
 * Hook to edit report
 */
export const useEditReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, reportData }: { sessionId: string; reportData: any }) =>
      auditApi.editReport(sessionId, reportData),
    onSuccess: (data, variables) => {
      // Invalidate audit detail query
      queryClient.invalidateQueries({ queryKey: auditKeys.detail(variables.sessionId) });
      // Invalidate audit list
      queryClient.invalidateQueries({ queryKey: auditKeys.lists() });
    },
  });
};

/**
 * Hook to approve report
 */
export const useApproveReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: ApprovalRequest }) =>
      auditApi.approveReport(sessionId, data),
    onSuccess: (data, variables) => {
      // Invalidate audit detail query
      queryClient.invalidateQueries({ queryKey: auditKeys.detail(variables.sessionId) });
      // Invalidate audit list
      queryClient.invalidateQueries({ queryKey: auditKeys.lists() });
    },
  });
};

/**
 * Hook to fetch users
 */
export const useUserList = (search?: string) => {
  return useQuery({
    queryKey: auditKeys.userList(search),
    queryFn: () => auditApi.listUsers(search),
    staleTime: 0,
    refetchOnMount: 'always',
  });
};
```

---

### **Phase 5: Frontend - Audit UI Components**

Due to length constraints, I'll outline the key components with their structure:

#### **5.1 Main Page**
**File**: `client/src/components/Audit/AuditManagementPage.tsx`
- Layout container
- Tabs: All | Pending | Approved
- Integrates filters, table, and pagination

#### **5.2 List View**
**File**: `client/src/components/Audit/AuditListView.tsx`
- Uses `useAuditList` hook
- Renders `AuditTable` and `AuditFilters`
- Handles loading and error states

#### **5.3 Table Component**
**File**: `client/src/components/Audit/AuditTable.tsx`
- Responsive table design
- Columns: Session ID, User, Status, Approval Status, Actions
- Mobile-friendly card layout

#### **5.4 Detail View**
**File**: `client/src/components/Audit/AuditDetailView.tsx`
- Full report display
- User information
- Version history (if edited)
- Action buttons: Edit, Approve

#### **5.5 Edit View**
**File**: `client/src/components/Audit/AuditEditView.tsx`
- Form with sections for each report field
- Rich text editor for executive summary
- Dynamic lists for pain points and recommendations
- Required "Change Notes" field

#### **5.6 Approval Modal**
**File**: `client/src/components/Audit/ApprovalModal.tsx`
- Modal dialog for approval
- Optional message field
- Confirmation flow
- Shows success/error feedback

#### **5.7 Filters Component**
**File**: `client/src/components/Audit/AuditFilters.tsx`
- Status filter dropdown
- Approved/Pending toggle
- User search input
- Clear filters button

---

### **Phase 6: Routing & Navigation**

#### **6.1 Update CEO Dashboard Routes**
**File**: `client/src/routes/CeoDashboardRoutes.tsx` (MODIFY)
```typescript
import { FeatureGuard } from '~/components/Guards/FeatureGuard';
import { AuditManagementPage } from '~/components/Audit';

// Add audit route
<Route
  path="audit"
  element={
    <FeatureGuard feature="audit">
      <AuditManagementPage />
    </FeatureGuard>
  }
>
  <Route index element={<AuditListView />} />
  <Route path=":sessionId" element={<AuditDetailView />} />
  <Route path=":sessionId/edit" element={<AuditEditView />} />
</Route>
```

#### **6.2 Update Navigation Menu**
**File**: `client/src/components/Nav/CeoDashboardNav.tsx` (MODIFY)
```typescript
import { ConditionalMenuItem } from './ConditionalMenuItem';

// Add audit menu item
<ConditionalMenuItem feature="audit">
  <NavItem to="/ceo-dashboard/audit" icon={ClipboardCheck}>
    Audit Management
  </NavItem>
</ConditionalMenuItem>
```

---

## 📝 Environment Configuration

### **Required Environment Variables**

**Only 2-3 variables needed!** Features are defined in constants, not environment.

```bash
# Business Configuration (REQUIRED)
BUSINESS_NAME=scaffad                     # Business identifier
# Features automatically loaded from constants based on BUSINESS_NAME

# Audit Platform API (ONLY if business has 'audit' feature)
AUDIT_ADMIN_API_URL=https://audit.scaffad.com/api/admin
ADMIN_API_SECRET=56d6e133-7574-4b46-b749-d15b4a784377

# CORS (on Audit Platform API side)
# Add jamot-chat domain to allowed origins
ALLOWED_ORIGINS=https://your-jamot-chat-domain.com
```

### **Example Configurations**

**Scaffad Deployment (.env.scaffad)**
```bash
# Business Configuration
BUSINESS_NAME=scaffad
# Features: audit, social-media, user-management (defined in constants)

# Audit API (needed because Scaffad has 'audit' feature)
AUDIT_ADMIN_API_URL=https://audit.scaffad.com/api/admin
ADMIN_API_SECRET=56d6e133-7574-4b46-b749-d15b4a784377
```

**Jamot Deployment (.env.jamot)**
```bash
# Business Configuration
BUSINESS_NAME=jamot
# Features: social-media, financial-analytics (defined in constants)

# No AUDIT_ADMIN_API_URL needed - Jamot doesn't have audit feature
```

**Generic Deployment (.env.generic)**
```bash
# Business Configuration
BUSINESS_NAME=generic
# Features: social-media (defined in constants)

# Minimal configuration - no additional API credentials needed
```

### **Adding New Features to Existing Business**

Simply update the constants file - **no .env changes needed!**

```javascript
// api/constants/businesses.js
SCAFFAD: {
  name: 'scaffad',
  displayName: 'Scaffad',
  defaultFeatures: [
    'audit', 
    'social-media', 
    'user-management',
    'new-feature'  // Just add here!
  ],
}
```

---

## 🧪 Testing Strategy

### **Backend Testing**

#### **1. Feature Service Tests**
```bash
# Test feature flag logic
- getEnabledFeatures() returns features from constants based on BUSINESS_NAME
- isFeatureEnabled() correctly checks features against business config
- getBusinessConfig() returns correct business object
- isValidBusiness() validates against registry
- Invalid BUSINESS_NAME returns empty features array
- Logs warning when BUSINESS_NAME is invalid
```

#### **2. Middleware Tests**
```bash
# Test feature guard middleware
- requireFeature() blocks when feature disabled
- requireFeature() allows when feature enabled
- requireValidBusiness() blocks invalid business names
```

#### **3. Audit API Integration Tests**
```bash
# Test API proxy service
- listAudits() calls external API correctly
- getAuditDetails() handles 404 errors
- editReport() includes admin ID header
- approveReport() handles email failures gracefully
```

### **Frontend Testing**

#### **1. Feature Flag Hook Tests**
```bash
# Test useFeatureFlag hook
- Returns correct isEnabled value
- Handles loading state
- Handles error state
- Updates when config changes
```

#### **2. Feature Guard Tests**
```bash
# Test FeatureGuard component
- Renders children when feature enabled
- Redirects when feature disabled
- Shows loading spinner during fetch
- Shows error message when appropriate
```

#### **3. Component Tests**
```bash
# Test audit components
- AuditListView renders table correctly
- AuditFilters updates query params
- ApprovalModal submits correctly
- Error messages display API errors
```

### **Integration Testing**

#### **1. Feature Flag Flow**
```bash
1. Set BUSINESS_NAME=scaffad in .env
2. Restart server (features loaded from constants: audit, social-media, user-management)
3. Visit /ceo-dashboard/audit as CEO user
4. Verify page renders
5. Verify API calls work
6. Set BUSINESS_NAME=jamot in .env
7. Restart server (features loaded from constants: social-media, financial-analytics - no audit)
8. Visit /ceo-dashboard/audit
9. Verify redirect to /ceo-dashboard
10. Verify audit menu item hidden
11. Verify social-media menu item still visible
```

#### **2. API Integration Flow**
```bash
1. Configure AUDIT_ADMIN_API_URL and ADMIN_API_SECRET
2. Call GET /api/admin/audits
3. Verify bearer token sent
4. Verify response matches expected format
5. Test approval flow end-to-end
6. Verify email sent to user
```

---

## 🚀 Deployment Checklist

### **Pre-Deployment**

- [ ] Business constants file created (`api/constants/businesses.js`)
- [ ] FeatureService implemented and tested
- [ ] Feature guard middleware implemented
- [ ] Audit API service implemented
- [ ] Audit controller implemented
- [ ] Audit routes created with guards
- [ ] Routes conditionally loaded in index.js
- [ ] Frontend business constants created
- [ ] useFeatureFlag hook implemented
- [ ] FeatureGuard component implemented
- [ ] Audit UI components created
- [ ] Audit routes added to CEO dashboard
- [ ] Conditional menu items added to navigation
- [ ] All TypeScript types defined
- [ ] API client functions implemented
- [ ] React Query hooks created

### **Environment Configuration**

- [ ] `BUSINESS_NAME` set in .env
- [ ] `ENABLED_FEATURES` set in .env
- [ ] `AUDIT_ADMIN_API_URL` configured (if audit enabled)
- [ ] `ADMIN_API_SECRET` configured (if audit enabled)
- [ ] CORS configured on Audit Platform API
- [ ] Domain whitelisted on external API

### **Testing**

- [ ] Feature service unit tests passing
- [ ] Middleware tests passing
- [ ] API integration tests passing
- [ ] Frontend hook tests passing
- [ ] Component tests passing
- [ ] Integration test with audit enabled passing
- [ ] Integration test with audit disabled passing
- [ ] Manual testing completed

### **Documentation**

- [ ] Environment variables documented
- [ ] Feature flag usage documented
- [ ] API integration documented
- [ ] Component structure documented
- [ ] Deployment guide updated

---

## 📚 Usage Documentation

### **For Developers**

#### **Adding a New Business**

1. Add to `api/constants/businesses.js`:
```javascript
ANOTHER_BUSINESS: {
  name: 'another-business',
  displayName: 'Another Business',
  defaultFeatures: ['social-media', 'user-management'],
  description: 'Description here'
}
```

2. Add to `client/src/constants/businesses.ts`:
```typescript
ANOTHER_BUSINESS: {
  name: 'another-business',
  displayName: 'Another Business',
  description: 'Description here',
}
```

3. Deploy with **just one environment variable**:
```bash
BUSINESS_NAME=another-business
# Features automatically: social-media, user-management
```

That's it! Features are automatically loaded from constants.

#### **Adding a New Feature**

1. Add to `AVAILABLE_FEATURES` in constants
2. Implement feature components/services
3. Add feature guard to routes
4. Add conditional menu item
5. Update .env with feature name
6. Test with feature enabled/disabled

#### **Protecting a Route with Feature Flag**

```typescript
<Route
  path="new-feature"
  element={
    <FeatureGuard feature="new-feature">
      <NewFeaturePage />
    </FeatureGuard>
  }
/>
```

#### **Protecting an API Endpoint**

```javascript
router.get('/api/new-feature',
  requireJwtAuth,
  requireFeature('new-feature'),
  NewFeatureController.handler
);
```

### **For Admins**

#### **Enabling Audit Feature for a Business**

1. Update business constants to include 'audit':
```javascript
// api/constants/businesses.js
YOUR_BUSINESS: {
  name: 'your-business',
  displayName: 'Your Business',
  defaultFeatures: ['audit', 'social-media'], // Add 'audit' here
  description: 'Your business description'
}
```

2. Set environment variables:
```bash
BUSINESS_NAME=your-business
AUDIT_ADMIN_API_URL=https://audit.your-business.com/api/admin
ADMIN_API_SECRET=your-secret-here
```

3. Ensure CORS configured on Audit Platform
4. Restart application
5. Login as CEO user
6. Navigate to CEO Dashboard
7. Click "Audit Management" in menu

#### **Disabling Audit Feature for a Business**

1. Remove 'audit' from business constants:
```javascript
// api/constants/businesses.js
YOUR_BUSINESS: {
  name: 'your-business',
  displayName: 'Your Business',
  defaultFeatures: ['social-media', 'user-management'], // Remove 'audit'
  description: 'Your business description'
}
```

2. Restart application
3. Audit menu item will disappear
4. Audit routes will return 403 if accessed directly

**Note**: You can also switch between businesses by changing `BUSINESS_NAME` in .env without code changes!

---

## 🔮 Future Enhancements

### **Phase 2 - Advanced Features** (Not in current scope)

1. **Granular Permissions**
   - `audit.view` - View audits only
   - `audit.edit` - Edit reports
   - `audit.approve` - Approve reports
   - Assign different permissions to different CEO users

2. **Runtime Feature Toggling**
   - Admin UI to enable/disable features
   - Database-driven feature flags
   - No restart required

3. **Feature Analytics**
   - Track feature usage per business
   - Monitor audit approval times
   - Report generation metrics

4. **Multi-Business Support in Single Deployment**
   - Users belong to specific business
   - Features enabled per business in DB
   - Single deployment serves multiple businesses

5. **Audit Dashboard Widgets**
   - Pending approvals count
   - Average approval time
   - Most active users
   - Revenue from audits

6. **Bulk Operations**
   - Approve multiple reports at once
   - Bulk edit common fields
   - Export multiple reports

---

## ⚠️ Known Limitations

1. **No Caching**: All API calls fetch fresh data (as per requirements)
2. **No Real-time Updates**: Users must refresh to see changes
3. **CEO-Only Access**: No granular permissions within CEO role
4. **Environment-Based Config**: Requires restart to change features
5. **Single External API**: Assumes single audit platform per deployment

---

## 📞 Support & Troubleshooting

### **Feature Not Showing**

1. Check `BUSINESS_NAME` in .env is valid (exists in constants)
2. Verify business constants include the feature in `defaultFeatures` array
3. Check server startup logs for feature configuration
4. Check browser console for errors
5. Verify user has CEO profile type
6. Clear browser cache and restart app

**Example Debug:**
```bash
# Server startup should show:
=== Feature Configuration ===
Business: Scaffad (scaffad)
Enabled Features: audit, social-media, user-management
Valid Business: Yes
============================
```

### **API Calls Failing**

1. Verify `AUDIT_ADMIN_API_URL` is correct
2. Check `ADMIN_API_SECRET` matches external API
3. Ensure CORS configured on external API
4. Check network tab for error details
5. Review server logs for detailed errors

### **403 Forbidden Errors**

1. Verify user is logged in
2. Check user has CEO profile type
3. Verify feature is enabled in business constants for current `BUSINESS_NAME`
4. Check bearer token is being sent to external API
5. Verify external API secret matches `ADMIN_API_SECRET`
6. Check server logs for "Feature not available" message

---

## ✅ Success Criteria

### **Backend**
- [x] Feature service correctly identifies enabled features
- [x] Feature guards block unauthorized access
- [x] Audit API service successfully proxies requests
- [x] Routes conditionally load based on features
- [x] Business registry validates deployment configuration

### **Frontend**
- [x] Feature flag hook provides accurate state
- [x] Feature guard redirects when feature disabled
- [x] Audit components render correctly
- [x] API calls work without caching
- [x] Error messages display API responses
- [x] Mobile responsive design

### **Integration**
- [x] CEO users can access audit page when feature enabled
- [x] Non-CEO users cannot access audit page
- [x] Users redirected when feature disabled
- [x] Menu items conditionally render
- [x] External API calls include bearer token
- [x] Approval workflow works end-to-end

---

## 📅 Implementation Timeline

### **Estimated Timeline: 3-4 Days**

**Day 1: Backend Foundation**
- Business constants (30 min)
- FeatureService (1 hour)
- Feature guard middleware (30 min)
- Update config controller (30 min)
- Testing (1 hour)

**Day 2: Audit API Integration**
- AuditAdminService (2 hours)
- AuditAdminController (1.5 hours)
- Routes and guards (1 hour)
- Integration testing (1.5 hours)

**Day 3: Frontend Foundation & Data Layer**
- Business constants (30 min)
- Feature flag hook (1 hour)
- Feature guard component (1 hour)
- TypeScript types (1 hour)
- API client (1.5 hours)
- React Query hooks (1 hour)

**Day 4: UI Components**
- AuditManagementPage (1 hour)
- AuditListView (1.5 hours)
- AuditDetailView (1.5 hours)
- AuditEditView (2 hours)
- Filters, modals, etc. (1 hour)
- Integration & testing (2 hours)

---

## 📝 Next Steps

1. **Review and approve this plan**
2. **Set up environment variables**
3. **Begin Phase 1 implementation** (Backend foundation)
4. **Test each phase before moving to next**
5. **Deploy to staging for testing**
6. **Deploy to production when validated**

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-16  
**Status**: Ready for Implementation
