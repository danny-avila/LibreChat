# Admin Dashboard Components

This directory contains all components for the Admin Reporting Dashboard feature.

## Main Component

### AdminDashboard

The main container component that orchestrates all dashboard functionality.

**Features:**
- Overview metrics (users, conversations, messages, tokens, system health)
- User analytics with growth charts and top users table
- Conversation analytics with activity charts and endpoint distribution
- Token usage analytics with cost breakdowns
- Message analytics with type breakdowns
- Time range filtering (today, last 7/30/90 days, custom)
- Real-time updates with auto-refresh (30 seconds)
- Manual refresh capability
- Data export functionality

**Usage:**
```tsx
import { AdminDashboard } from '~/components/Admin/Dashboard';

function AdminPage() {
  return <AdminDashboard />;
}
```

## Child Components

### MetricCard
Displays a single metric with optional change indicator and icon.

### TimeRangeSelector
Allows users to select predefined or custom date ranges for filtering metrics.

### ExportButton
Provides export functionality for dashboard data in CSV or JSON formats.

### UserGrowthChart
Line chart showing user registration trends over time.

### TokenUsageChart
Bar chart displaying token consumption by endpoint.

### ConversationActivityChart
Area chart showing conversation creation activity over time.

### EndpointDistributionChart
Pie chart showing the distribution of conversations across different endpoints.

### TopUsersTable
Sortable table displaying top users by various metrics (conversations, tokens, messages).

## Data Flow

1. **AdminDashboard** manages state and data fetching using React Query
2. Time range changes trigger refetch of all metrics
3. Auto-refresh updates data every 30 seconds (when enabled)
4. Each section receives data from the parent and handles its own rendering
5. Loading and error states are managed at the component level

## API Integration

The dashboard uses the following API endpoints:
- `GET /api/admin/dashboard/overview` - Overview metrics
- `GET /api/admin/dashboard/users` - User analytics
- `GET /api/admin/dashboard/conversations` - Conversation analytics
- `GET /api/admin/dashboard/tokens` - Token usage analytics
- `GET /api/admin/dashboard/messages` - Message analytics
- `POST /api/admin/dashboard/export` - Data export

All endpoints support time range filtering via query parameters:
- `startDate` - ISO 8601 date string
- `endDate` - ISO 8601 date string
- `preset` - Predefined range (today, last7days, last30days, last90days)

## Requirements Coverage

This implementation satisfies all requirements from the specification:

- **User Analytics (Req 1.1-1.5)**: Total users, active users, new registrations, auth methods
- **Conversation Analytics (Req 2.1-2.6)**: Totals, activity, endpoint distribution, length
- **Token Analytics (Req 3.1-3.7)**: Usage, costs, balances, cache stats
- **Message Analytics (Req 4.1-4.5)**: Totals, activity, type breakdown, errors
- **Time Range Filtering (Req 5.1-5.5)**: Presets, custom ranges, validation
- **Data Visualization (Req 6.1-6.5)**: Charts for all major metrics
- **Top Users (Req 7.1-7.5)**: Sortable table with multiple metrics
- **Export (Req 8.1-8.5)**: CSV and JSON formats
- **Real-time Updates (Req 9.1-9.5)**: Auto-refresh, manual refresh, pause/resume
- **System Health (Req 10.1-10.5)**: Response times, error rates, cache stats
- **Access Control (Req 11.1-11.5)**: Admin-only access (handled by API)
- **Performance (Req 12.1-12.5)**: Optimized queries, caching, loading states

## Testing

The dashboard components should be tested for:
- Correct rendering with various data states (loading, error, success)
- Time range filtering updates all metrics
- Auto-refresh functionality
- Export functionality
- Chart rendering with different datasets
- Table sorting functionality

## Performance Considerations

- React Query handles caching and deduplication of API requests
- Auto-refresh is configurable and can be paused
- Charts use responsive containers for optimal rendering
- Loading states prevent layout shifts
- Error boundaries catch and display errors gracefully
