# User and Group Statistics Feature

## Overview

This feature provides comprehensive statistics and analytics for LibreChat administrators, including user token usage leaderboards and group-based usage analytics.

## Features

### 1. User Statistics & Leaderboard
- **User Balance Leaderboard**: Ranking of users by token usage/remaining balance
- **Individual User Analytics**: Detailed usage statistics per user
- **Token Usage Tracking**: Prompt tokens, completion tokens, and total costs
- **Time-based Analytics**: Daily, weekly, monthly usage patterns

### 2. Group Statistics
- **Group Usage Summary**: Total token usage per group (sum of all members)
- **Group Member Analytics**: Usage statistics for users within each group
- **Group Comparison**: Compare usage across different groups
- **Time Window Impact**: How time windows affect group usage

### 3. Admin Dashboard
- **Real-time Statistics**: Live usage data and trends
- **Export Functionality**: CSV/Excel export of statistics
- **Filtering & Sorting**: By date range, usage amount, groups, etc.
- **Visual Charts**: Usage graphs and trend visualization

## API Endpoints

### User Statistics
- `GET /api/admin/users/statistics` - Get user leaderboard and statistics
- `GET /api/admin/users/{userId}/statistics` - Get individual user statistics

### Group Statistics  
- `GET /api/admin/groups/statistics` - Get group usage summary
- `GET /api/admin/groups/{groupId}/statistics` - Get specific group statistics

### Combined Analytics
- `GET /api/admin/statistics/overview` - Get overall platform statistics

## Implementation Details

See individual files:
- [User Statistics](./user-statistics.md)
- [Group Statistics](./group-statistics.md)
- [API Design](./api-design.md)
- [UI Components](./ui-components.md)