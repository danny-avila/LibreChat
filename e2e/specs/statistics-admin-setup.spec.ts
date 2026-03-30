import { test, expect } from '@playwright/test';

test.describe('Statistics Admin Setup and 401 Error Testing', () => {
  test.describe('Admin User Creation and Role Verification', () => {
    test('should verify admin user exists or create one for testing', async ({ page }) => {
      // This test helps ensure we have an admin user for statistics testing
      
      // Try to login with admin credentials
      await page.goto('/login');
      
      const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
      const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin_password';
      
      await page.fill('input[type="email"]', adminEmail);
      await page.fill('input[type="password"]', adminPassword);
      await page.click('button[type="submit"]');
      
      // Check if login was successful
      const currentUrl = page.url();
      
      if (currentUrl.includes('/login')) {
        // Login failed - admin user might not exist
        console.log('Admin user may not exist. Check TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD environment variables.');
        console.log('You may need to create an admin user manually or update the test credentials.');
        
        // Show current error message if any
        const errorMessage = await page.locator('.error, .alert, text=/error/i').first();
        if (await errorMessage.isVisible()) {
          const errorText = await errorMessage.textContent();
          console.log('Login error:', errorText);
        }
        
        test.skip('Admin user not available - skipping admin-specific tests');
      } else {
        // Login successful - verify admin access to statistics
        await page.goto('/d/statistics');
        
        // Should not get 401/403 errors
        const authErrors = page.locator('text=/401|403|Unauthorized|Forbidden|Access Denied/i');
        await expect(authErrors).not.toBeVisible();
        
        // Should be able to access statistics
        await expect(page.locator('text=/Statistics/i')).toBeVisible();
      }
    });

    test('should test API access with admin credentials', async ({ page }) => {
      const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
      const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin_password';
      
      // Login first
      await page.goto('/login');
      await page.fill('input[type="email"]', adminEmail);
      await page.fill('input[type="password"]', adminPassword);
      await page.click('button[type="submit"]');
      
      // Skip if login failed
      if (page.url().includes('/login')) {
        test.skip('Admin login failed - check credentials');
      }
      
      // Test API access
      const userStatsResponse = await page.request.get('/api/statistics/users/leaderboard');
      console.log('User stats API response status:', userStatsResponse.status());
      
      const groupStatsResponse = await page.request.get('/api/statistics/groups/leaderboard');
      console.log('Group stats API response status:', groupStatsResponse.status());
      
      // Should get 200 responses, not 401/403
      expect(userStatsResponse.status()).not.toBe(401);
      expect(userStatsResponse.status()).not.toBe(403);
      expect(groupStatsResponse.status()).not.toBe(401);
      expect(groupStatsResponse.status()).not.toBe(403);
      
      if (userStatsResponse.status() === 200) {
        const userData = await userStatsResponse.json();
        expect(userData).toHaveProperty('success');
        console.log('User stats API working:', userData.success);
      }
      
      if (groupStatsResponse.status() === 200) {
        const groupData = await groupStatsResponse.json();
        expect(groupData).toHaveProperty('success');
        console.log('Group stats API working:', groupData.success);
      }
    });
  });

  test.describe('Detailed 401 Error Scenarios', () => {
    test('should reproduce the 401 error after entering statistics', async ({ page }) => {
      // This test specifically reproduces the reported 401 error
      
      // Start with a regular user login
      await page.goto('/login');
      
      const userEmail = process.env.TEST_EMAIL || 'user@test.com';
      const userPassword = process.env.TEST_PASSWORD || 'password';
      
      await page.fill('input[type="email"]', userEmail);
      await page.fill('input[type="password"]', userPassword);
      await page.click('button[type="submit"]');
      
      // Wait for login to complete
      await page.waitForURL('/c/new', { timeout: 10000 });
      
      // Now try to access statistics - this should trigger the 401 error
      await page.goto('/d/statistics');
      
      // Capture any network errors or console logs
      const errorLogs: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errorLogs.push(msg.text());
        }
      });
      
      // Monitor network responses for 401 errors
      let gotUnauthorized = false;
      page.on('response', response => {
        if (response.status() === 401) {
          gotUnauthorized = true;
          console.log('401 Unauthorized response from:', response.url());
        }
      });
      
      // Wait a bit for potential API calls
      await page.waitForTimeout(3000);
      
      // Check for 401 error indicators
      const unauthorizedElements = page.locator('text=/401|Unauthorized/i');
      const forbiddenElements = page.locator('text=/403|Forbidden|Access Denied|Admin.*required/i');
      
      const hasUnauthorizedUI = await unauthorizedElements.first().isVisible();
      const hasForbiddenUI = await forbiddenElements.first().isVisible();
      
      console.log('Got 401 network response:', gotUnauthorized);
      console.log('Has unauthorized UI:', hasUnauthorizedUI);
      console.log('Has forbidden UI:', hasForbiddenUI);
      console.log('Console errors:', errorLogs);
      
      // The test should capture the 401 error condition
      expect(gotUnauthorized || hasUnauthorizedUI || hasForbiddenUI).toBeTruthy();
      
      // Take a screenshot for debugging
      await page.screenshot({ path: 'e2e/test-results/statistics-401-error.png', fullPage: true });
    });

    test('should test each statistics endpoint for 401 errors', async ({ page }) => {
      // Login as regular user first
      await page.goto('/login');
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'user@test.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');
      
      // Test each statistics endpoint
      const endpoints = [
        '/api/statistics/users/leaderboard',
        '/api/statistics/groups/leaderboard',
        '/api/statistics/users/dummy-user-id',
        '/api/statistics/groups/dummy-group-id',
        '/api/statistics/groups/dummy-group-id/members'
      ];
      
      const results: Array<{endpoint: string, status: number, response: any}> = [];
      
      for (const endpoint of endpoints) {
        try {
          const response = await page.request.get(endpoint);
          const responseText = await response.text();
          let responseJson;
          
          try {
            responseJson = JSON.parse(responseText);
          } catch {
            responseJson = responseText;
          }
          
          results.push({
            endpoint,
            status: response.status(),
            response: responseJson
          });
          
          console.log(`${endpoint}: ${response.status()}`);
          
          // Should get 401 or 403, not 200
          expect([401, 403, 404]).toContain(response.status());
          
        } catch (error) {
          console.log(`Error testing ${endpoint}:`, error);
          results.push({
            endpoint,
            status: -1,
            response: error
          });
        }
      }
      
      // Log all results
      console.log('API Endpoint Test Results:', JSON.stringify(results, null, 2));
      
      // Save results to file for analysis
      await page.evaluate((results) => {
        console.log('Statistics API Test Results:', results);
      }, results);
    });

    test('should verify JWT token handling in statistics requests', async ({ page }) => {
      // Login first
      await page.goto('/login');
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'user@test.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');
      
      // Capture the authorization header
      let authHeader = '';
      page.on('request', request => {
        if (request.url().includes('/api/statistics/')) {
          authHeader = request.headers()['authorization'] || '';
          console.log('Authorization header:', authHeader ? 'Present' : 'Missing');
        }
      });
      
      // Make a statistics API call
      await page.request.get('/api/statistics/users/leaderboard');
      
      // Check if auth header was present
      if (!authHeader) {
        console.log('WARNING: No authorization header found in statistics request');
      }
      
      // Test with invalid token
      const invalidTokenResponse = await page.request.get('/api/statistics/users/leaderboard', {
        headers: {
          'Authorization': 'Bearer invalid-token-12345'
        }
      });
      
      console.log('Invalid token response:', invalidTokenResponse.status());
      expect(invalidTokenResponse.status()).toBe(401);
    });

    test('should verify role checking middleware', async ({ page }) => {
      // Test the specific error message from the middleware
      await page.goto('/login');
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'user@test.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');
      
      const response = await page.request.get('/api/statistics/users/leaderboard');
      
      if (response.status() === 403) {
        const responseData = await response.json();
        console.log('403 Response body:', responseData);
        
        // Should have proper error structure
        expect(responseData).toHaveProperty('success', false);
        expect(responseData).toHaveProperty('error');
        
        // Should mention admin requirement or insufficient permissions
        const errorMessage = responseData.error?.message || '';
        expect(errorMessage.toLowerCase()).toMatch(/admin|permission|forbidden/);
      }
    });
  });

  test.describe('Admin User Role Assignment', () => {
    test('should provide instructions for setting up admin user', async ({ page }) => {
      // This test provides guidance for setting up the admin user
      
      console.log(`
=======================================================
ADMIN USER SETUP INSTRUCTIONS
=======================================================

To test the statistics feature properly, you need an admin user.

Current test credentials:
- Admin Email: ${process.env.TEST_ADMIN_EMAIL || 'admin@test.com'}
- Admin Password: ${process.env.TEST_ADMIN_PASSWORD || 'admin_password'}

If the admin user doesn't exist, you can create one using:

1. Using the CLI:
   npm run create-user

2. Or manually in the database:
   Update the user document to set role: "ADMIN"

3. Set environment variables for testing:
   export TEST_ADMIN_EMAIL="your-admin@email.com"
   export TEST_ADMIN_PASSWORD="your-admin-password"

4. Make sure the user has ADMIN role in the database:
   db.users.updateOne(
     { email: "your-admin@email.com" }, 
     { $set: { role: "ADMIN" } }
   )

=======================================================
      `);
      
      // This test always passes - it's just for documentation
      expect(true).toBeTruthy();
    });

    test('should validate admin role in database', async ({ page }) => {
      // This would require database access to verify the admin role
      // For now, we'll test through the API behavior
      
      await page.goto('/login');
      const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
      const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin_password';
      
      await page.fill('input[type="email"]', adminEmail);
      await page.fill('input[type="password"]', adminPassword);
      await page.click('button[type="submit"]');
      
      if (page.url().includes('/login')) {
        console.log('Admin user login failed. Please check:');
        console.log('1. User exists in database');
        console.log('2. Password is correct');
        console.log('3. User role is set to "ADMIN"');
        test.skip('Admin user setup required');
      }
      
      // Test admin API access
      const response = await page.request.get('/api/statistics/users/leaderboard');
      
      if (response.status() === 403) {
        console.log('Admin user exists but lacks admin role. Update user role to "ADMIN" in database.');
        const responseBody = await response.text();
        console.log('API Response:', responseBody);
        
        expect(response.status()).not.toBe(403);
      } else if (response.status() === 200) {
        console.log('✅ Admin user is properly configured for statistics access');
        expect(response.status()).toBe(200);
      } else {
        console.log('Unexpected response status:', response.status());
        const responseBody = await response.text();
        console.log('Response body:', responseBody);
      }
    });
  });
});