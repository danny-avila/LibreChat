# Group Statistics Feature Specification

## Purpose
Provide administrators with insights into group-based token usage, enabling better resource allocation and group management decisions.

## Group Usage Statistics

### Group Leaderboard Columns
| Column | Description | Data Source |
|--------|-------------|-------------|
| Rank | Position by total usage | Calculated |
| Group Name | Group identifier | Group model |
| Total Members | Number of users in group | Group model |
| Total Tokens Used | Sum of all member usage | Transaction model |
| Average per Member | Total usage / member count | Calculated |
| Group Balance | Sum of member balances | Balance model |
| Most Active Member | User with highest usage | Transaction model |
| Time Windows Active | Number of active time windows | Group model |
| Last Group Activity | Most recent member activity | Transaction model |
| Created Date | Group creation date | Group model |

### Group Metrics Dashboard
```json
{
  "groupId": "group_123",
  "groupName": "Teachers",
  "description": "Teaching staff group",
  "memberCount": 25,
  "isActive": true,
  "timeWindows": [
    {
      "name": "School Hours",
      "windowType": "weekly", 
      "isActive": true
    }
  ],
  "totalUsage": {
    "promptTokens": 450000,
    "completionTokens": 320000,
    "totalTokens": 770000,
    "totalCost": 42.35
  },
  "memberUsage": {
    "averagePerMember": 30800,
    "highestUser": {
      "userId": "user_456",
      "email": "teacher1@school.com",
      "tokens": 85000
    },
    "lowestUser": {
      "userId": "user_789", 
      "email": "teacher2@school.com",
      "tokens": 5200
    }
  },
  "groupBalance": {
    "totalBalance": 125000,
    "averageBalance": 5000,
    "membersWithLowBalance": 3
  },
  "activityPattern": {
    "peakHours": ["09:00-12:00", "14:00-16:00"],
    "peakDays": ["Monday", "Tuesday", "Wednesday"],
    "timeWindowCompliance": 0.87
  },
  "periodComparison": {
    "thisMonth": { "tokens": 180000, "cost": 9.85 },
    "lastMonth": { "tokens": 165000, "cost": 8.95 },
    "growth": "+9.1%"
  },
  "topModels": [
    { "model": "gpt-4", "usage": 462000, "percentage": 60 },
    { "model": "gpt-3.5-turbo", "usage": 308000, "percentage": 40 }
  ]
}
```

## Member Statistics within Groups

### Individual Member View in Group Context
- Member's contribution to group total
- Ranking within the group
- Comparison to group average
- Time window compliance rate
- Model preferences within group context

### Group Member Leaderboard
```json
{
  "groupId": "group_123",
  "groupName": "Teachers", 
  "members": [
    {
      "rank": 1,
      "userId": "user_456",
      "email": "teacher1@school.com",
      "tokens": 85000,
      "percentageOfGroup": 11.0,
      "balance": 8500,
      "complianceRate": 0.95,
      "lastActivity": "2024-08-12T15:30:00Z"
    },
    {
      "rank": 2, 
      "userId": "user_457",
      "email": "teacher2@school.com", 
      "tokens": 72000,
      "percentageOfGroup": 9.4,
      "balance": 12000,
      "complianceRate": 0.88,
      "lastActivity": "2024-08-12T14:15:00Z"
    }
  ],
  "groupTotals": {
    "totalTokens": 770000,
    "totalMembers": 25,
    "averagePerMember": 30800
  }
}
```

## Cross-Group Comparison

### Group Performance Matrix
- **Usage Efficiency**: Tokens per member ratio
- **Balance Management**: Group balance sustainability  
- **Activity Patterns**: Peak usage times and compliance
- **Growth Trends**: Month-over-month usage changes
- **Model Preferences**: Popular models per group

### Group Ranking Metrics
1. **Total Usage**: Raw token consumption
2. **Usage Efficiency**: Tokens per active member
3. **Balance Health**: Average member balance 
4. **Compliance Rate**: Time window adherence
5. **Growth Rate**: Usage trend over time

## Database Queries

### Group Statistics Aggregation
```javascript
// Get group usage statistics with member details
const groupStats = await Transaction.aggregate([
  {
    $match: {
      createdAt: { $gte: startDate, $lte: endDate }
    }
  },
  {
    $lookup: {
      from: "users",
      localField: "user",
      foreignField: "_id", 
      as: "userInfo"
    }
  },
  {
    $lookup: {
      from: "groups",
      let: { userId: "$user" },
      pipeline: [
        {
          $match: {
            $expr: { $in: ["$$userId", "$members"] }
          }
        }
      ],
      as: "userGroups"
    }
  },
  {
    $unwind: "$userGroups"
  },
  {
    $group: {
      _id: "$userGroups._id",
      groupName: { $first: "$userGroups.name" },
      groupDescription: { $first: "$userGroups.description" },
      memberCount: { $first: { $size: "$userGroups.members" }},
      totalTokens: { $sum: "$rawAmount" },
      promptTokens: { 
        $sum: { $cond: [{ $eq: ["$tokenType", "prompt"] }, "$rawAmount", 0] }
      },
      completionTokens: { 
        $sum: { $cond: [{ $eq: ["$tokenType", "completion"] }, "$rawAmount", 0] }
      },
      totalCost: { $sum: "$tokenValue" },
      lastActivity: { $max: "$createdAt" },
      uniqueMembers: { $addToSet: "$user" }
    }
  },
  {
    $addFields: {
      activeMembers: { $size: "$uniqueMembers" },
      averagePerMember: { $divide: ["$totalTokens", "$memberCount"] }
    }
  },
  {
    $sort: { totalTokens: -1 }
  }
]);
```

### Time Window Compliance Query
```javascript
// Calculate group compliance with time windows
const complianceStats = await Transaction.aggregate([
  // Match transactions within time window periods
  // Calculate compliance rates per group
  // Return percentage of compliant usage
]);
```

## API Endpoints

### Group Statistics
- `GET /api/admin/groups/statistics` - All groups summary
- `GET /api/admin/groups/{groupId}/statistics` - Specific group details
- `GET /api/admin/groups/{groupId}/members/statistics` - Group member leaderboard
- `GET /api/admin/groups/comparison` - Cross-group comparison

### Filtering & Sorting
- Date range filtering
- Usage threshold filtering
- Member count filtering
- Sort by usage, efficiency, balance, etc.

## Time Window Integration

### Compliance Metrics
- **In-Window Usage**: Tokens used during allowed time windows
- **Out-of-Window Usage**: Tokens used outside time windows
- **Compliance Rate**: Percentage of usage within windows
- **Window Effectiveness**: Impact of time windows on group usage

### Time-Based Analytics
- Hour-by-hour usage patterns
- Day-of-week usage distribution
- Holiday/weekend usage patterns
- Time window optimization suggestions

## Performance & Caching
- Cache group statistics for 30 minutes
- Pre-calculate daily group summaries
- Optimize queries with proper indexing
- Pagination for large member lists