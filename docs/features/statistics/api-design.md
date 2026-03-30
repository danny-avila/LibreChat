# Statistics API Design

## Base URL
All statistics endpoints are prefixed with `/api/admin/statistics`

## Authentication & Authorization
- All endpoints require JWT authentication (`requireJwtAuth`)
- Admin role required (`SystemRoles.ADMIN`)
- Rate limiting: 100 requests per minute per admin user

## User Statistics Endpoints

### Get User Leaderboard
```
GET /api/admin/statistics/users/leaderboard
```

**Query Parameters:**
- `page` (number, default: 1) - Page number for pagination
- `limit` (number, default: 50, max: 100) - Results per page  
- `sortBy` (string, default: 'totalTokens') - Sort field
  - Options: 'totalTokens', 'balance', 'lastActivity', 'joinDate', 'totalCost'
- `sortOrder` (string, default: 'desc') - Sort direction
- `dateFrom` (ISO date) - Start date for usage filtering
- `dateTo` (ISO date) - End date for usage filtering
- `groupId` (string) - Filter by specific group
- `minUsage` (number) - Minimum token usage threshold
- `maxUsage` (number) - Maximum token usage threshold
- `includeInactive` (boolean, default: false) - Include inactive users

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "rank": 1,
        "userId": "user_123",
        "email": "user@example.com",
        "username": "user123", 
        "totalTokens": 250000,
        "promptTokens": 150000,
        "completionTokens": 100000,
        "currentBalance": 15000,
        "totalCost": 18.75,
        "lastActivity": "2024-08-12T15:30:00Z",
        "joinDate": "2024-01-15T10:00:00Z",
        "groups": ["teachers", "premium"],
        "averageDaily": 2500,
        "conversationCount": 145
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalUsers": 247,
      "usersPerPage": 50
    },
    "summary": {
      "totalTokensUsed": 12500000,
      "totalCost": 895.25,
      "averagePerUser": 50607,
      "mostActiveUser": "user@example.com",
      "dateRange": {
        "from": "2024-07-01T00:00:00Z",
        "to": "2024-08-12T23:59:59Z"
      }
    }
  }
}
```

### Get Individual User Statistics
```
GET /api/admin/statistics/users/{userId}
```

**Query Parameters:**
- `dateFrom` (ISO date) - Start date for statistics
- `dateTo` (ISO date) - End date for statistics
- `includeHistory` (boolean, default: false) - Include daily usage history

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user_123",
    "email": "user@example.com",
    "joinDate": "2024-01-15T10:00:00Z",
    "groups": [
      {
        "groupId": "group_456",
        "groupName": "Teachers",
        "memberSince": "2024-01-20T10:00:00Z"
      }
    ],
    "currentBalance": 15000,
    "totalUsage": {
      "promptTokens": 125000,
      "completionTokens": 89000,
      "totalTokens": 214000,
      "totalCost": 12.45
    },
    "periodUsage": {
      "today": { "tokens": 1200, "cost": 0.08 },
      "thisWeek": { "tokens": 8500, "cost": 0.52 },
      "thisMonth": { "tokens": 35000, "cost": 2.15 }
    },
    "topModels": [
      {
        "model": "gpt-4",
        "usage": 89000,
        "cost": 7.25,
        "percentage": 41.6
      }
    ],
    "averages": {
      "tokensPerDay": 2400,
      "tokensPerConversation": 1800,
      "conversationsPerDay": 1.3
    },
    "usageHistory": [
      {
        "date": "2024-08-12",
        "promptTokens": 800,
        "completionTokens": 400,
        "totalTokens": 1200,
        "cost": 0.08,
        "conversations": 3
      }
    ]
  }
}
```

## Group Statistics Endpoints

### Get Group Leaderboard
```
GET /api/admin/statistics/groups/leaderboard
```

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20, max: 50)
- `sortBy` (string, default: 'totalTokens')
  - Options: 'totalTokens', 'averagePerMember', 'memberCount', 'totalCost', 'lastActivity'
- `sortOrder` (string, default: 'desc')
- `dateFrom` (ISO date)
- `dateTo` (ISO date)
- `minMembers` (number) - Minimum member count
- `includeInactive` (boolean, default: false)

**Response:**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "rank": 1,
        "groupId": "group_123",
        "groupName": "Teachers",
        "description": "Teaching staff group",
        "memberCount": 25,
        "activeMemberCount": 22,
        "totalTokens": 770000,
        "averagePerMember": 30800,
        "totalCost": 42.35,
        "groupBalance": 125000,
        "timeWindowsActive": 2,
        "complianceRate": 0.87,
        "lastActivity": "2024-08-12T16:45:00Z",
        "createdAt": "2024-01-10T09:00:00Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalGroups": 12,
      "groupsPerPage": 20
    },
    "summary": {
      "totalGroups": 12,
      "totalMembers": 247,
      "totalTokensUsed": 5600000,
      "averageGroupSize": 20.6,
      "mostActiveGroup": "Teachers"
    }
  }
}
```

### Get Group Details
```
GET /api/admin/statistics/groups/{groupId}
```

**Response:** Detailed group statistics (see group-statistics.md)

### Get Group Member Statistics
```
GET /api/admin/statistics/groups/{groupId}/members
```

**Response:** Member leaderboard within group context

## Combined Statistics Endpoints

### Platform Overview
```
GET /api/admin/statistics/overview
```

**Response:**
```json
{
  "success": true,
  "data": {
    "platform": {
      "totalUsers": 247,
      "activeUsers": 198,
      "totalGroups": 12,
      "activeGroups": 11
    },
    "usage": {
      "totalTokensUsed": 12500000,
      "totalCost": 895.25,
      "dailyAverage": 125000,
      "monthlyGrowth": 0.15
    },
    "topUsers": [
      {
        "userId": "user_123",
        "email": "user@example.com",
        "tokens": 250000
      }
    ],
    "topGroups": [
      {
        "groupId": "group_456", 
        "groupName": "Teachers",
        "tokens": 770000
      }
    ],
    "models": [
      {
        "model": "gpt-4",
        "usage": 7500000,
        "cost": 600.25,
        "percentage": 60
      }
    ]
  }
}
```

### Export Statistics
```
POST /api/admin/statistics/export
```

**Request Body:**
```json
{
  "type": "users" | "groups" | "overview",
  "format": "csv" | "xlsx",
  "dateFrom": "2024-07-01T00:00:00Z",
  "dateTo": "2024-08-12T23:59:59Z",
  "filters": {
    "groupId": "group_123",
    "minUsage": 1000
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "/api/admin/statistics/download/export_12345.csv",
    "expiresAt": "2024-08-13T10:00:00Z",
    "recordCount": 247
  }
}
```

## Error Responses

### Standard Error Format
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Admin role required to access statistics",
    "details": {}
  }
}
```

### Common Error Codes
- `INSUFFICIENT_PERMISSIONS` (403) - Not an admin user
- `INVALID_DATE_RANGE` (400) - Invalid date parameters
- `RESOURCE_NOT_FOUND` (404) - User/group not found
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `INVALID_PAGINATION` (400) - Invalid page/limit parameters

## Rate Limiting
- **Admin Users**: 100 requests/minute
- **Export Endpoints**: 5 requests/hour
- **Heavy Queries**: 20 requests/minute

## Caching Strategy
- User leaderboard: 15 minutes
- Group statistics: 30 minutes  
- Platform overview: 5 minutes
- Individual user stats: 10 minutes
- Export results: 1 hour

## Database Indexes Required
```javascript
// Transactions collection
{ user: 1, createdAt: -1 }
{ conversationId: 1, createdAt: -1 }
{ tokenType: 1, createdAt: -1 }
{ model: 1, createdAt: -1 }

// Balances collection  
{ user: 1 }
{ tokenCredits: -1 }

// Users collection
{ createdAt: -1 }
{ role: 1 }

// Groups collection
{ members: 1 }
{ isActive: 1, createdAt: -1 }
```