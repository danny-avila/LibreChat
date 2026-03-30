# User Statistics Feature Specification

## Purpose
Provide administrators with detailed insights into individual user token usage and create a leaderboard system for monitoring platform utilization.

## User Leaderboard

### Display Columns
| Column | Description | Data Source |
|--------|-------------|-------------|
| Rank | Position in leaderboard | Calculated |
| Username/Email | User identifier | User model |
| Total Tokens Used | Sum of all token usage | Transaction model |
| Prompt Tokens | Input tokens used | Transaction model |
| Completion Tokens | Output tokens used | Transaction model |
| Current Balance | Remaining token credits | Balance model |
| Total Spent (Cost) | Calculated cost based on tokens | Transaction model |
| Last Activity | Last API usage timestamp | Transaction model |
| Join Date | User registration date | User model |

### Sorting Options
- **By Usage (Default)**: Highest token usage first
- **By Balance**: Users with lowest balance first
- **By Activity**: Most recently active first
- **By Join Date**: Newest users first
- **By Cost**: Highest spending users first

### Filtering Options
- **Date Range**: Filter by usage period (last 7/30/90 days, custom range)
- **User Groups**: Filter by specific groups
- **Usage Threshold**: Minimum/maximum token usage
- **Balance Range**: Users within specific balance ranges
- **Activity Status**: Active/inactive users

### Key Metrics
- **Average Daily Usage**: Tokens per day per user
- **Usage Trend**: Increase/decrease compared to previous period
- **Top Consumers**: Top 10 users by usage
- **Inactive Users**: Users with no recent activity
- **Balance Warnings**: Users with low balance

## Individual User Statistics

### User Profile Stats
```json
{
  "userId": "user_123",
  "email": "user@example.com", 
  "joinDate": "2024-01-15T10:00:00Z",
  "groups": ["teachers", "premium"],
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
  "usageHistory": [
    {
      "date": "2024-08-12",
      "promptTokens": 800,
      "completionTokens": 400,
      "totalTokens": 1200,
      "cost": 0.08
    }
  ],
  "topModels": [
    { "model": "gpt-4", "usage": 89000, "percentage": 41.6 },
    { "model": "gpt-3.5-turbo", "usage": 125000, "percentage": 58.4 }
  ],
  "averages": {
    "tokensPerDay": 2400,
    "tokensPerConversation": 1800,
    "conversationsPerDay": 1.3
  }
}
```

## Database Queries

### User Leaderboard Query
```javascript
// Aggregate user token usage from Transaction collection
const userStats = await Transaction.aggregate([
  {
    $match: {
      createdAt: { $gte: startDate, $lte: endDate }
    }
  },
  {
    $group: {
      _id: "$user",
      totalTokens: { $sum: "$rawAmount" },
      promptTokens: { 
        $sum: { $cond: [{ $eq: ["$tokenType", "prompt"] }, "$rawAmount", 0] }
      },
      completionTokens: { 
        $sum: { $cond: [{ $eq: ["$tokenType", "completion"] }, "$rawAmount", 0] }
      },
      totalCost: { $sum: "$tokenValue" },
      lastActivity: { $max: "$createdAt" },
      conversationCount: { $addToSet: "$conversationId" }
    }
  },
  {
    $lookup: {
      from: "users",
      localField: "_id", 
      foreignField: "_id",
      as: "user"
    }
  },
  {
    $lookup: {
      from: "balances",
      localField: "_id",
      foreignField: "user", 
      as: "balance"
    }
  },
  {
    $sort: { totalTokens: -1 }
  },
  {
    $limit: 100
  }
]);
```

## Admin Permissions
- Only users with `SystemRoles.ADMIN` role can access statistics
- Statistics endpoints require `requireJwtAuth` and admin role validation

## Performance Considerations
- Implement pagination for large datasets
- Cache frequently requested statistics (15-minute cache)
- Use database indexes on frequently queried fields:
  - `transactions: { user: 1, createdAt: -1 }`
  - `balances: { user: 1 }`
  - `users: { createdAt: -1 }`

## Security & Privacy
- Anonymization option for user identifiers
- Audit logging for statistics access
- Rate limiting on statistics endpoints
- Optional user consent for statistics tracking