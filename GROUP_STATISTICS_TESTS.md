# Group Statistics Feature - Test Suite

This document provides comprehensive information about the unit tests for the Group Statistics feature in LibreChat.

## 📋 Overview

The Group Statistics feature test suite includes comprehensive unit tests for both backend and frontend components, covering:

- **Backend Controllers** - API logic and database operations
- **API Routes** - HTTP endpoints and middleware
- **React Components** - UI components and user interactions
- **React Hooks** - Data fetching and state management

## 🏗️ Test Structure

### Backend Tests

#### `GroupStatisticsController.spec.js`
Tests the main controller functions:
- `getGroupLeaderboard()` - Group rankings with pagination, filtering, and sorting
- `getGroupStatistics()` - Detailed individual group analytics
- `getGroupMemberStatistics()` - Member-level statistics within groups

**Coverage includes:**
- ✅ Successful data retrieval and aggregation
- ✅ Authentication and authorization checks
- ✅ Pagination and sorting logic
- ✅ Date filtering and query parameters
- ✅ Error handling for various scenarios
- ✅ Empty state handling
- ✅ Database aggregation pipeline testing

#### `statistics.spec.js`
Tests the API routes and middleware:
- Route parameter handling
- Query parameter parsing
- Authentication middleware integration
- Admin role authorization
- HTTP method validation
- Error response formatting

### Frontend Tests

#### `hooks.spec.ts`
Tests the React Query hooks and API functions:
- Data fetching functions (`fetchGroupLeaderboard`, `fetchGroupStatistics`, `fetchGroupMemberStatistics`)
- React Query hooks (`useGroupLeaderboard`, `useGroupStatistics`, `useGroupMemberStatistics`)
- Query parameter handling
- Loading and error states
- Caching and stale time configuration

#### `GroupLeaderboard.spec.tsx`
Tests the main leaderboard component:
- Data rendering (summary cards, tables, pagination)
- Sorting functionality
- Filter integration
- Navigation to detail views
- Loading and error states
- Empty state handling
- User interactions (clicks, navigation)

#### `GroupStatsFilters.spec.tsx`
Tests the filtering component:
- Filter panel visibility toggling
- Date range input handling
- Quick date preset buttons
- Minimum members filtering
- Include inactive groups checkbox
- Filter application and cancellation
- Query parameter updates

#### `GroupStatsDetail.spec.tsx`
Tests the detailed group view component:
- Group information display
- Statistics cards and metrics
- Member table with sorting
- Period comparison charts
- Time window compliance
- Model usage breakdown
- Navigation and refresh functionality

## 🧪 Running Tests

### Prerequisites

Make sure you have installed dependencies:
```bash
npm install
```

### Individual Test Files

Run specific test files:

```bash
# Backend controller tests
npm run test:api -- api/server/controllers/GroupStatisticsController.spec.js

# API routes tests
npm run test:api -- api/server/routes/statistics.spec.js

# Frontend hooks tests
npm run test:client -- client/src/components/Statistics/__tests__/hooks.spec.ts

# Component tests
npm run test:client -- client/src/components/Statistics/Groups/__tests__/GroupLeaderboard.spec.tsx
npm run test:client -- client/src/components/Statistics/Groups/__tests__/GroupStatsFilters.spec.tsx
npm run test:client -- client/src/components/Statistics/Groups/__tests__/GroupStatsDetail.spec.tsx
```

### All Tests at Once

Use the provided test runner script:

```bash
# Run all Group Statistics tests
node test-group-statistics.js

# Run only backend tests
node test-group-statistics.js --backend

# Run only frontend tests
node test-group-statistics.js --frontend

# List all test files
node test-group-statistics.js --list
```

## 📊 Test Coverage Areas

### Data Handling
- ✅ API data fetching and response parsing
- ✅ Database aggregation and filtering
- ✅ Pagination and sorting logic
- ✅ Date range filtering
- ✅ Query parameter handling

### User Interface
- ✅ Component rendering with various data states
- ✅ User interactions (clicks, form inputs, navigation)
- ✅ Loading states and error handling
- ✅ Responsive behavior and accessibility

### Business Logic
- ✅ Group ranking calculations
- ✅ Token usage aggregations
- ✅ Balance pool calculations
- ✅ Period comparison logic
- ✅ Member statistics within groups

### Error Scenarios
- ✅ Network failures and API errors
- ✅ Authentication and authorization failures
- ✅ Invalid data handling
- ✅ Empty state scenarios
- ✅ Database connection issues

### Security & Authorization
- ✅ Admin-only access enforcement
- ✅ JWT authentication validation
- ✅ Parameter sanitization
- ✅ Error message security (no sensitive data leakage)

## 🛠️ Test Configuration

### Mock Strategy
The tests use comprehensive mocking for:
- **Database Models** - Mongoose models mocked for predictable data
- **External Dependencies** - React Router, LibreChat UI components
- **Utility Functions** - Formatting functions for consistent output
- **API Calls** - Fetch API mocked for controlled responses

### Test Data
Tests include realistic mock data representing:
- Group hierarchies with various member counts
- Token usage patterns and costs
- Balance distributions across members
- Time window configurations
- Period comparison scenarios

## 🔍 Key Test Scenarios

### Happy Path Scenarios
- ✅ Successful data retrieval and display
- ✅ Proper sorting and filtering
- ✅ Correct navigation between views
- ✅ Accurate calculations and formatting

### Edge Cases
- ✅ Empty groups and zero usage
- ✅ Large numbers and extreme values
- ✅ Missing or incomplete data
- ✅ Rapid user interactions

### Error Conditions
- ✅ Network connectivity issues
- ✅ Server errors and timeouts
- ✅ Invalid user permissions
- ✅ Malformed data responses

### Performance Scenarios
- ✅ Large datasets and pagination
- ✅ Multiple concurrent requests
- ✅ Query optimization validation
- ✅ Caching behavior verification

## 📈 Metrics and Assertions

The test suite validates:

### Data Accuracy
- Correct aggregation of token usage
- Accurate balance calculations
- Proper ranking and sorting
- Valid percentage calculations

### User Experience
- Loading states during data fetching
- Error messages and retry functionality
- Intuitive navigation flow
- Responsive design elements

### Performance
- Query efficiency (mocked but validated)
- Pagination functionality
- Caching behavior
- Optimistic updates

## 🚀 Continuous Integration

These tests are designed to run in CI/CD pipelines with:
- **Fast execution** - Mocked dependencies for speed
- **Reliable results** - Predictable mock data
- **Clear reporting** - Descriptive test names and error messages
- **Isolated execution** - No external dependencies

## 🔧 Maintenance

### Adding New Tests
When adding new features to Group Statistics:

1. **Backend Changes**: Add tests to `GroupStatisticsController.spec.js`
2. **API Changes**: Update `statistics.spec.js`
3. **Frontend Changes**: Add component-specific test files
4. **Hook Changes**: Update `hooks.spec.ts`

### Test Data Updates
Update mock data in test files when:
- Adding new fields to API responses
- Changing data structures
- Adding new business logic scenarios

### Debugging Tests
Common debugging approaches:
- Check mock configurations for updated dependencies
- Verify API contract changes affect test expectations
- Review console output for detailed error messages
- Use test-specific debugging tools and techniques

This comprehensive test suite ensures the Group Statistics feature is robust, reliable, and maintainable across future development cycles.