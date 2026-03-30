import { test, expect } from '@playwright/test';

test.describe('Statistics Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/login');
  });

  test.describe('Unauthorized Access', () => {
    test('should show 401 error when accessing statistics without login', async ({ page }) => {
      // Try to access statistics page directly without authentication
      await page.goto('/d/statistics');
      
      // Should redirect to login or show unauthorized message
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show 401 error when accessing user statistics API without auth', async ({ page }) => {
      // Try to access API endpoint directly
      const response = await page.request.get('/api/statistics/users/leaderboard');
      
      expect(response.status()).toBe(401);
      expect(await response.text()).toContain('Unauthorized');
    });

    test('should show 401 error when accessing group statistics API without auth', async ({ page }) => {
      // Try to access API endpoint directly
      const response = await page.request.get('/api/statistics/groups/leaderboard');
      
      expect(response.status()).toBe(401);
      expect(await response.text()).toContain('Unauthorized');
    });
  });

  test.describe('Non-Admin User Access', () => {
    test.beforeEach(async ({ page }) => {
      // Login as regular user (not admin)
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'user@test.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password');
      await page.click('button[type="submit"]');
      
      // Wait for login to complete
      await page.waitForURL('/c/new');
    });

    test('should show 403 error when non-admin tries to access statistics', async ({ page }) => {
      // Navigate to statistics page
      await page.goto('/d/statistics');
      
      // Should show access denied or redirect
      // Check for error message or redirect to unauthorized page
      const content = page.locator('body');
      await expect(content).toContainText(/403|Forbidden|Access Denied|Insufficient|Admin/i);
    });

    test('should show 403 error when non-admin calls user statistics API', async ({ page }) => {
      const response = await page.request.get('/api/statistics/users/leaderboard');
      
      expect(response.status()).toBe(403);
      const responseText = await response.text();
      expect(responseText).toContain('Forbidden');
    });

    test('should show 403 error when non-admin calls group statistics API', async ({ page }) => {
      const response = await page.request.get('/api/statistics/groups/leaderboard');
      
      expect(response.status()).toBe(403);
      const responseText = await response.text();
      expect(responseText).toContain('Forbidden');
    });

    test('should not show statistics navigation option for non-admin', async ({ page }) => {
      // Try to access dashboard
      await page.goto('/d/prompts');
      
      // Statistics should not be visible in navigation
      const statsLink = page.locator('text=/Statistics/i');
      await expect(statsLink).not.toBeVisible();
    });
  });

  test.describe('Admin User Access', () => {
    test.beforeEach(async ({ page }) => {
      // This test assumes you have an admin user set up
      // You may need to create an admin user first or use a different email
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin_password');
      await page.click('button[type="submit"]');
      
      // Wait for login to complete
      await page.waitForURL('/c/new');
    });

    test('should allow admin to access statistics page', async ({ page }) => {
      // Navigate to statistics page
      await page.goto('/d/statistics');
      
      // Should load successfully without 401/403 errors
      await expect(page.locator('text=/Statistics/i')).toBeVisible();
      
      // Should not show error messages
      const errorMessages = page.locator('text=/401|403|Unauthorized|Forbidden|Access Denied/i');
      await expect(errorMessages).not.toBeVisible();
    });

    test('should allow admin to access user statistics', async ({ page }) => {
      await page.goto('/d/statistics/users');
      
      // Should show user statistics components
      await expect(page.locator('text=/User.*Leaderboard/i')).toBeVisible();
      await expect(page.locator('text=/User Statistics/i')).toBeVisible();
    });

    test('should allow admin to access group statistics', async ({ page }) => {
      await page.goto('/d/statistics/groups');
      
      // Should show group statistics components
      await expect(page.locator('text=/Group.*Statistics/i')).toBeVisible();
      await expect(page.locator('text=/Group.*Leaderboard/i')).toBeVisible();
    });

    test('should successfully call user statistics API as admin', async ({ page }) => {
      const response = await page.request.get('/api/statistics/users/leaderboard');
      
      expect(response.status()).toBe(200);
      const responseData = await response.json();
      expect(responseData).toHaveProperty('success', true);
      expect(responseData).toHaveProperty('data');
    });

    test('should successfully call group statistics API as admin', async ({ page }) => {
      const response = await page.request.get('/api/statistics/groups/leaderboard');
      
      expect(response.status()).toBe(200);
      const responseData = await response.json();
      expect(responseData).toHaveProperty('success', true);
      expect(responseData).toHaveProperty('data');
    });

    test('should show statistics navigation option for admin', async ({ page }) => {
      await page.goto('/d/prompts');
      
      // Statistics should be visible in navigation for admin
      const statsAccordion = page.locator('[data-testid="statistics-accordion"], text=/Statistics/i').first();
      await expect(statsAccordion).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test.beforeEach(async ({ page }) => {
      // Login as regular user
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'user@test.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');
    });

    test('should handle network errors gracefully', async ({ page }) => {
      // Intercept API calls and simulate network error
      await page.route('**/api/statistics/**', route => {
        route.abort('failed');
      });

      await page.goto('/d/statistics');
      
      // Should show appropriate error handling
      const errorElement = page.locator('text=/Error|Failed to load|Network error/i');
      await expect(errorElement).toBeVisible({ timeout: 10000 });
    });

    test('should show retry option on API failures', async ({ page }) => {
      // Intercept API calls and return server error
      await page.route('**/api/statistics/**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({
            success: false,
            error: { message: 'Internal server error' }
          })
        });
      });

      await page.goto('/d/statistics');
      
      // Should show retry button or similar recovery option
      const retryButton = page.locator('button:has-text("Try Again"), button:has-text("Retry"), button:has-text("Refresh")');
      await expect(retryButton.first()).toBeVisible({ timeout: 10000 });
    });

    test('should handle malformed API responses', async ({ page }) => {
      // Intercept API calls and return invalid JSON
      await page.route('**/api/statistics/**', route => {
        route.fulfill({
          status: 200,
          body: 'Invalid JSON response'
        });
      });

      await page.goto('/d/statistics');
      
      // Should handle parsing error gracefully
      const errorElement = page.locator('text=/Error|Failed|Invalid/i');
      await expect(errorElement).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Authentication State Management', () => {
    test('should redirect to login when token expires', async ({ page }) => {
      // Login first
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'user@test.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');

      // Clear authentication token to simulate expiration
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Try to access statistics
      await page.goto('/d/statistics');
      
      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('should maintain authentication across page refreshes', async ({ page }) => {
      // Login as admin
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin_password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');

      // Navigate to statistics
      await page.goto('/d/statistics');
      await expect(page.locator('text=/Statistics/i')).toBeVisible();

      // Refresh the page
      await page.reload();

      // Should still have access
      await expect(page.locator('text=/Statistics/i')).toBeVisible();
      
      // Should not show authentication errors
      const authErrors = page.locator('text=/401|403|Unauthorized|Forbidden/i');
      await expect(authErrors).not.toBeVisible();
    });
  });

  test.describe('Role-based Access Control', () => {
    test('should respect role changes in real-time', async ({ page }) => {
      // This test would require a way to change user roles during the test
      // It's more of an integration test scenario
      test.skip('Role changes during session - requires backend support');
    });

    test('should enforce admin-only endpoints consistently', async ({ page }) => {
      // Login as regular user
      await page.fill('input[type="email"]', process.env.TEST_EMAIL || 'user@test.com');
      await page.fill('input[type="password"]', process.env.TEST_PASSWORD || 'password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');

      // Test all statistics endpoints return 403
      const endpoints = [
        '/api/statistics/users/leaderboard',
        '/api/statistics/groups/leaderboard',
        '/api/statistics/users/test-user-id',
        '/api/statistics/groups/test-group-id',
        '/api/statistics/groups/test-group-id/members'
      ];

      for (const endpoint of endpoints) {
        const response = await page.request.get(endpoint);
        expect(response.status()).toBe(403);
      }
    });

    test('should validate admin access for all statistics operations', async ({ page }) => {
      // Login as admin
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin_password');
      await page.click('button[type="submit"]');
      await page.waitForURL('/c/new');

      // Test all statistics endpoints are accessible
      const endpoints = [
        '/api/statistics/users/leaderboard',
        '/api/statistics/groups/leaderboard'
      ];

      for (const endpoint of endpoints) {
        const response = await page.request.get(endpoint);
        expect(response.status()).toBe(200);
        
        const data = await response.json();
        expect(data).toHaveProperty('success', true);
      }
    });
  });
});