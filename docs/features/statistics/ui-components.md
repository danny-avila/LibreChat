# Statistics UI Components

## Admin Dashboard Layout

### Main Navigation Addition
- Add "Statistics" tab to admin dashboard
- Icon: BarChart3 from Lucide React
- Position: After "Group Management" tab

### Dashboard Structure
```
/d/statistics
├── /users          # User leaderboard & analytics
├── /groups         # Group statistics & comparison  
├── /overview       # Platform overview dashboard
└── /exports        # Export management
```

## User Statistics Components

### UserLeaderboard Component
**Location:** `client/src/components/Statistics/Users/UserLeaderboard.tsx`

**Features:**
- Sortable table with user ranking
- Pagination (50 users per page)
- Real-time search and filtering
- Export to CSV functionality

**Table Columns:**
- Rank badge with medal icons (🥇🥈🥉) for top 3
- User avatar + email/username
- Token usage with progress bars
- Balance with color coding (red < 1000, yellow < 5000, green >= 5000)
- Last activity with relative time ("2 hours ago")
- Actions dropdown (View Details, Reset Balance, etc.)

### UserStatsCard Component
**Location:** `client/src/components/Statistics/Users/UserStatsCard.tsx`

**Design:** Card layout showing:
- User profile section with avatar and basic info
- Token usage chart (prompt vs completion tokens)
- Balance status with trend indicator
- Activity timeline
- Top models used with percentages

### UserStatsFilters Component
**Location:** `client/src/components/Statistics/Users/UserStatsFilters.tsx`

**Filter Options:**
- Date range picker (Last 7/30/90 days, Custom)
- Group multiselect dropdown
- Usage range sliders (min/max tokens)
- Balance range filters
- Active/Inactive toggle
- Sort by dropdown

## Group Statistics Components

### GroupLeaderboard Component
**Location:** `client/src/components/Statistics/Groups/GroupLeaderboard.tsx`

**Features:**
- Group ranking table with member count
- Usage per member calculations
- Time window compliance indicators
- Group comparison charts

**Table Columns:**
- Rank with progress indicators
- Group name with member count badge
- Total tokens with breakdown (prompt/completion)
- Average per member with benchmarking
- Balance pool status
- Compliance rate with visual indicators
- Actions (View Details, Manage Group)

### GroupStatsDetail Component
**Location:** `client/src/components/Statistics/Groups/GroupStatsDetail.tsx`

**Sections:**
- Group overview (name, description, member count)
- Usage charts (daily/weekly trends)
- Member leaderboard within group
- Time window effectiveness analysis
- Model usage distribution

### GroupComparison Component
**Location:** `client/src/components/Statistics/Groups/GroupComparison.tsx`

**Features:**
- Side-by-side group comparison
- Usage efficiency metrics
- Member engagement rates
- Cost per group analysis
- Growth trend comparisons

## Dashboard Overview Components

### StatsDashboard Component
**Location:** `client/src/components/Statistics/Dashboard/StatsDashboard.tsx`

**Layout:** Grid of metric cards and charts:
- Platform overview metrics (total users, groups, usage)
- Top performers (users and groups)
- Usage trends over time
- Cost analysis and predictions
- Model popularity distribution

### MetricCard Component
**Location:** `client/src/components/Statistics/Common/MetricCard.tsx`

**Props:**
```typescript
interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    period: string;
    trend: 'up' | 'down' | 'neutral';
  };
  icon?: React.ComponentType;
  format?: 'number' | 'currency' | 'percentage';
}
```

### UsageChart Component
**Location:** `client/src/components/Statistics/Common/UsageChart.tsx`

**Chart Types:**
- Line chart for usage over time
- Bar chart for user/group comparisons
- Pie chart for model distribution
- Area chart for cumulative usage

## Common Components

### StatsPagination Component
**Location:** `client/src/components/Statistics/Common/StatsPagination.tsx`

**Features:**
- Custom pagination with page size selector
- Jump to page functionality
- Results summary ("Showing 1-50 of 247")

### ExportButton Component  
**Location:** `client/src/components/Statistics/Common/ExportButton.tsx`

**Features:**
- Export dropdown (CSV, Excel)
- Progress indicator during export
- Download link generation
- Export history

### StatsFilters Component
**Location:** `client/src/components/Statistics/Common/StatsFilters.tsx`

**Reusable Filters:**
- DateRangePicker
- GroupSelector
- UsageRangeSlider
- SortByDropdown
- SearchInput

## Responsive Design

### Desktop Layout (≥1024px)
- Full table view with all columns
- Side-by-side comparison charts
- Detailed metric cards

### Tablet Layout (768px-1023px)
- Simplified table with essential columns
- Stacked chart layout
- Condensed metric cards

### Mobile Layout (<768px)
- Card-based list view instead of tables
- Single-column layout
- Collapsible filter panel
- Touch-optimized controls

## Styling & Theming

### Color Scheme
```css
/* Usage levels */
--usage-low: #10b981;      /* Green for low usage */
--usage-medium: #f59e0b;   /* Amber for medium usage */
--usage-high: #ef4444;     /* Red for high usage */

/* Balance levels */
--balance-critical: #dc2626;  /* Red < 1000 */
--balance-warning: #d97706;   /* Orange 1000-5000 */
--balance-healthy: #059669;   /* Green > 5000 */

/* Ranking colors */
--rank-gold: #fbbf24;      /* Gold for #1 */
--rank-silver: #9ca3af;    /* Silver for #2 */
--rank-bronze: #92400e;    /* Bronze for #3 */
```

### Component Classes
```css
/* Statistics table styling */
.stats-table {
  @apply w-full border-collapse border-spacing-0;
}

.stats-row {
  @apply border-b border-gray-200 hover:bg-gray-50;
}

.rank-badge {
  @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium;
}

.usage-progress {
  @apply w-full bg-gray-200 rounded-full h-2;
}

.metric-card {
  @apply bg-white rounded-lg shadow p-6 border border-gray-200;
}
```

## Accessibility Features

### ARIA Labels
- Table headers with sort indicators
- Progress bars with value announcements  
- Filter controls with clear labels
- Export status announcements

### Keyboard Navigation
- Tab navigation through all interactive elements
- Enter/Space for button activation
- Arrow keys for table navigation
- Escape to close dropdowns/modals

### Screen Reader Support
- Descriptive alt text for charts
- Table captions and summaries
- Status announcements for loading states
- Meaningful error messages

## Performance Considerations

### Virtual Scrolling
- Implement virtual scrolling for large user lists (1000+ users)
- Progressive loading of group member lists
- Lazy loading of detailed statistics

### Caching Strategy
- Cache API responses for 15 minutes
- Invalidate cache on user actions
- Store filter preferences in localStorage
- Debounced search input (300ms)

### Loading States
- Skeleton screens for initial loads
- Shimmer effects for table rows
- Spinner for export generation
- Progressive enhancement for charts

## Testing Strategy

### Unit Tests
- Component rendering with mock data
- Filter logic validation  
- Sorting and pagination behavior
- Export functionality

### Integration Tests
- API integration with statistics endpoints
- User interaction flows
- Filter combination effects
- Error handling scenarios

### E2E Tests
- Complete user workflows
- Export file download and validation  
- Cross-browser compatibility
- Responsive design testing