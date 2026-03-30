# VS Code Configuration for LibreChat Testing

This directory contains VS Code configuration files to help you run and debug tests efficiently in the LibreChat project.

## 🚀 Quick Start

### Running Tests

1. **Press `F5`** or go to `Run and Debug` panel (Ctrl/Cmd+Shift+D)
2. **Select a test configuration** from the dropdown
3. **Click the green play button** or press F5

### Available Test Configurations

#### 🧪 Main Test Runners
- **🧪 Run All Tests** - Runs all API tests using npm script
- **🔧 Run API Tests** - Backend/API tests with coverage
- **⚛️ Run Client Tests** - Frontend/React component tests
- **🎭 Run E2E Tests** - End-to-end Playwright tests

#### 🔐 Epic 3 Specific Tests  
- **🔐 Run Epic 3 Access Control Tests** - All Epic 3 time window access control tests
- **🏗️ Run Time Window Component Tests** - Time window UI and API component tests

#### 🎯 Development & Debugging
- **🎯 Run Single Test File** - Run the currently open test file
- **🔍 Debug Single Test File** - Debug the currently open test file with breakpoints
- **🔥 Run Tests in Watch Mode** - Continuous testing during development
- **📊 Run Tests with Coverage Report** - Generate HTML coverage report

#### 🛠️ Utility Configurations
- **🚫 Run Failed Tests Only** - Re-run only previously failed tests
- **🔧 Run Specific API Test Pattern** - Run tests matching a specific pattern

### Compound Configurations (Run Multiple at Once)

- **🧪 Run All Test Suites** - Runs both API and Client tests in parallel
- **🔐 Epic 3 Complete Test Suite** - Runs all Epic 3 related tests

## 📋 Tasks (Ctrl/Cmd+Shift+P → "Tasks: Run Task")

### Test Tasks
- `🧪 Run All Tests` - Default test task (Ctrl/Cmd+Shift+P → "Test")
- `🔧 Run API Tests` - API test suite
- `⚛️ Run Client Tests` - Client test suite
- `🔐 Run Epic 3 Time Window Tests` - Epic 3 specific tests
- `📊 Run Tests with Coverage` - Generate coverage report
- `🔥 Watch API Tests` - Watch mode for API tests
- `🔥 Watch Client Tests` - Watch mode for client tests

### Development Tasks
- `🚀 Start Backend Dev` - Start backend development server
- `🚀 Start Frontend Dev` - Start frontend development server
- `🏗️ Build All Packages` - Build all packages
- `🔍 Lint Code` - Run ESLint
- `🔧 Fix Lint Issues` - Auto-fix linting issues

### Utility Tasks
- `🧹 Clean Coverage` - Remove coverage files
- `📖 Open Coverage Report` - Open HTML coverage report

## 🎯 Running Tests for Epic 3

### Option 1: Use Launch Configuration
1. Open Run and Debug panel (Ctrl/Cmd+Shift+D)
2. Select "🔐 Run Epic 3 Access Control Tests"
3. Click Run (F5)

### Option 2: Use Task
1. Open Command Palette (Ctrl/Cmd+Shift+P)
2. Type "Tasks: Run Task"
3. Select "🔐 Run Epic 3 Time Window Tests"

### Option 3: Use Compound Configuration
1. Select "🔐 Epic 3 Complete Test Suite" 
2. This runs both access control and component tests

## 🔧 Configuration Files

### launch.json
Contains all the debugger configurations for running tests, with different options for:
- Running individual or all tests
- Debug mode with breakpoints
- Watch mode for continuous testing
- Coverage reporting
- E2E testing with Playwright

### tasks.json  
Defines build and test tasks that can be run via:
- Command Palette (`Ctrl/Cmd+Shift+P` → "Tasks: Run Task")
- Terminal menu
- Keyboard shortcuts (can be customized)

### settings.json
VS Code workspace settings optimized for LibreChat development:
- Jest configuration and test runner settings
- ESLint working directories
- File associations for test files
- Code formatting preferences
- Terminal environment variables

## 💡 Tips

### Running Single Test File
1. **Open a test file** (e.g., `TimeWindowController.spec.js`)
2. **Use "🎯 Run Single Test File"** configuration
3. **Or press `Ctrl/Cmd+F5`** for quick run without debugging

### Debugging Tests
1. **Set breakpoints** in your test or source code
2. **Use "🔍 Debug Single Test File"** configuration  
3. **Step through code** using debug controls

### Watch Mode Development
1. **Use "🔥 Run Tests in Watch Mode"** for continuous testing
2. **Tests auto-run** when you save files
3. **Great for TDD workflow**

### Coverage Reports
1. **Run "📊 Run Tests with Coverage Report"**
2. **Use "📖 Open Coverage Report" task** to view HTML report
3. **Coverage highlights** show in editor gutters

### E2E Testing
1. **Set test credentials** when prompted:
   - Default email: `admin@test.com`
   - Default password: `password123`
2. **Use headed mode** to see browser interactions
3. **Make sure backend is running** on port 3080

## 🐛 Troubleshooting

### Tests Not Running
- Ensure you're in the LibreChat root directory
- Check that `node_modules` are installed: `npm install`
- Verify test files exist in expected locations

### Coverage Not Generating
- Ensure Jest is installed: `cd api && npm install`
- Check that coverage directory has write permissions

### E2E Tests Failing
- Verify backend is running: `npm run backend:dev`
- Check test credentials are correct
- Ensure Playwright is installed: `npx playwright install`

### Debug Not Working
- Ensure Node.js debugger is enabled
- Check that source maps are available
- Verify file paths in launch.json are correct

## 📚 File Patterns

The configurations automatically detect test files with these patterns:
- `*.spec.js` - Jest/Node tests
- `*.spec.tsx` - React component tests  
- `*.test.js` - Alternative test naming
- `*.test.tsx` - Alternative React test naming

## 🎨 Customization

You can customize these configurations by:
1. **Modifying launch.json** - Add new debug configurations
2. **Updating tasks.json** - Add custom build/test tasks
3. **Editing settings.json** - Adjust editor and Jest settings
4. **Adding keyboard shortcuts** via VS Code settings

## 🔗 Related Commands

- `npm run test:api` - Run API tests via npm
- `npm run test:client` - Run client tests via npm
- `npm run e2e` - Run E2E tests via npm
- `npm run lint` - Run linting
- `npm run format` - Format code with Prettier

---

Happy Testing! 🧪✨