import { test, expect } from '@playwright/test';

test.describe('Statistics UI and Navigation', () => {
  // Setup for admin user - you may need to adjust these credentials
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin_password';
  
  test.beforeEach(async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    
    // Login as admin user
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', adminPassword);
    await page.click('button[type="submit"]');
    
    // Wait for successful login
    await page.waitForURL('/c/new');
  });

  test.describe('Statistics Navigation', () => {
    test('should navigate to statistics from dashboard', async ({ page }) => {
      // Go to dashboard
      await page.goto('/d/prompts');
      
      // Look for statistics in navigation/sidebar
      const statsLink = page.locator('text=/Statistics/i, [href*="statistics"]').first();
      await expect(statsLink).toBeVisible();
      
      // Click on statistics link
      await statsLink.click();
      
      // Should navigate to statistics page
      await expect(page).toHaveURL(/\/d\/statistics/);
    });

    test('should show statistics overview page by default', async ({ page }) => {
      await page.goto('/d/statistics');
      
      // Should show statistics overview content
      await expect(page.locator('text=/Statistics/i')).toBeVisible();
      await expect(page.locator('text=/User.*Leaderboard/i, text=/Group.*Statistics/i')).toBeVisible();
    });

    test('should navigate to user statistics', async ({ page }) => {
      await page.goto('/d/statistics');
      
      // Click on user statistics option
      const userStatsButton = page.locator('text=/User.*Leaderboard/i, button:has-text("User")').first();
      await userStatsButton.click();
      
      // Should navigate to user statistics
      await expect(page).toHaveURL(/\/d\/statistics\/users/);
      await expect(page.locator('text=/User.*Statistics/i, text=/Leaderboard/i')).toBeVisible();
    });

    test('should navigate to group statistics', async ({ page }) => {
      await page.goto('/d/statistics');
      
      // Click on group statistics option
      const groupStatsButton = page.locator('text=/Group.*Statistics/i, button:has-text("Group")').first();
      await groupStatsButton.click();
      
      // Should navigate to group statistics
      await expect(page).toHaveURL(/\/d\/statistics\/groups/);
      await expect(page.locator('text=/Group.*Statistics/i')).toBeVisible();
    });
  });

  test.describe('User Statistics Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/d/statistics/users');
    });

    test('should display user leaderboard components', async ({ page }) => {
      // Wait for page to load
      await page.waitForTimeout(2000);
      
      // Should show leaderboard title
      await expect(page.locator('text=/User.*Statistics/i, text=/User.*Leaderboard/i')).toBeVisible();
      
      // Should show filter components
      const filtersSection = page.locator('text=/Filters/i, [data-testid="user-stats-filters"]');
      await expect(filtersSection.first()).toBeVisible();
      
      // Should show refresh button
      const refreshButton = page.locator('button:has-text("Refresh")');
      await expect(refreshButton.first()).toBeVisible();
    });

    test('should handle loading states', async ({ page }) => {
      // Intercept API call to simulate loading
      await page.route('**/api/statistics/users/leaderboard', route => {
        // Delay response to test loading state
        setTimeout(() => {
          route.fulfill({
            status: 200,
            body: JSON.stringify({
              success: true,
              data: {
                users: [],
                pagination: { currentPage: 1, totalPages: 0, totalUsers: 0, usersPerPage: 20 },
                summary: { totalTokensUsed: 0, totalCost: 0, averagePerUser: 0, mostActiveUser: null }
              }
            })
          });
        }, 2000);
      });

      await page.reload();
      
      // Should show loading indicator
      const loadingIndicator = page.locator('text=/Loading/i, .spinner, [data-testid="spinner"]');
      await expect(loadingIndicator.first()).toBeVisible();
      
      // Loading should disappear after data loads
      await expect(loadingIndicator.first()).not.toBeVisible({ timeout: 5000 });
    });

    test('should handle API errors gracefully', async ({ page }) => {
      // Intercept API call to return error
      await page.route('**/api/statistics/users/leaderboard', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({
            success: false,
            error: { message: 'Internal server error' }
          })
        });
      });

      await page.reload();
      
      // Should show error message
      const errorMessage = page.locator('text=/Error/i, text=/Failed/i');
      await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
      
      // Should show retry button
      const retryButton = page.locator('button:has-text("Try Again"), button:has-text("Retry")');
      await expect(retryButton.first()).toBeVisible();
    });

    test('should display empty state when no users found', async ({ page }) => {
      // Mock empty response
      await page.route('**/api/statistics/users/leaderboard', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: {
              users: [],
              pagination: { currentPage: 1, totalPages: 0, totalUsers: 0, usersPerPage: 20 },
              summary: { totalTokensUsed: 0, totalCost: 0, averagePerUser: 0, mostActiveUser: null }
            }
          })
        });
      });

      await page.reload();
      
      // Should show empty state message
      const emptyState = page.locator('text=/No users found/i, text=/No data/i');
      await expect(emptyState.first()).toBeVisible({ timeout: 5000 });
    });

    test('should allow filtering and sorting', async ({ page }) => {
      // Wait for filters to be visible
      await expect(page.locator('text=/Filters/i').first()).toBeVisible();
      
      // Click on filters button to expand
      const filtersButton = page.locator('button:has-text("Filters")');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
      }
      
      // Should show filter options
      const dateInputs = page.locator('input[type="date"]');
      await expect(dateInputs.first()).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Group Statistics Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/d/statistics/groups');
    });

    test('should display group statistics components', async ({ page }) => {
      // Wait for page to load
      await page.waitForTimeout(2000);
      
      // Should show group statistics title
      await expect(page.locator('text=/Group.*Statistics/i')).toBeVisible();
      
      // Should show summary cards or statistics
      const summarySection = page.locator('text=/Total.*Groups/i, text=/Total.*Members/i');
      await expect(summarySection.first()).toBeVisible({ timeout: 5000 });
    });

    test('should handle group statistics API errors', async ({ page }) => {
      // Mock API error
      await page.route('**/api/statistics/groups/leaderboard', route => {
        route.fulfill({
          status: 403,
          body: JSON.stringify({
            success: false,
            error: { message: 'Insufficient permissions' }
          })
        });
      });

      await page.reload();
      
      // Should show error message
      const errorMessage = page.locator('text=/Error/i, text=/Insufficient permissions/i, text=/403/i');
      await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
    });

    test('should navigate to group details', async ({ page }) => {
      // Mock groups data with at least one group
      await page.route('**/api/statistics/groups/leaderboard', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            success: true,
            data: {
              groups: [
                {
                  groupId: 'test-group-1',
                  groupName: 'Test Group 1',
                  memberCount: 5,
                  totalTokens: 1000,
                  rank: 1
                }
              ],
              pagination: { currentPage: 1, totalPages: 1, totalGroups: 1, groupsPerPage: 20 },
              summary: { totalGroups: 1, totalMembers: 5, totalTokensUsed: 1000 }
            }
          })
        });
      });

      await page.reload();
      
      // Wait for group data to load
      await expect(page.locator('text=/Test Group 1/i')).toBeVisible({ timeout: 5000 });
      
      // Click on view details or group name
      const viewDetailsButton = page.locator('button:has-text("View Details"), text=/Test Group 1/i').first();
      if (await viewDetailsButton.isVisible()) {
        await viewDetailsButton.click();
        
        // Should navigate to group details page
        await expect(page).toHaveURL(/\/d\/statistics\/groups\/test-group-1/);
      }
    });
  });

  test.describe('Authentication Integration', () => {
    test('should handle 401 errors by redirecting to login', async ({ page }) => {
      // Clear authentication
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      // Try to access statistics
      const response = await page.goto('/d/statistics');
      
      // Should be redirected to login or show unauthorized
      if (response?.status() === 401) {
        expect(response.status()).toBe(401);
      } else {
        await expect(page).toHaveURL(/\/login/);
      }
    });

    test('should handle 403 errors gracefully', async ({ page }) => {
      // Mock 403 response
      await page.route('**/api/statistics/**', route => {
        route.fulfill({
          status: 403,
          body: JSON.stringify({
            success: false,
            error: { message: 'Admin role required' }
          })
        });
      });

      await page.goto('/d/statistics/users');
      
      // Should show 403 error message
      const errorMessage = page.locator('text=/403/i, text=/Forbidden/i, text=/Admin role required/i');
      await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
    });

    test('should retry failed requests', async ({ page }) => {
      let callCount = 0;
      await page.route('**/api/statistics/users/leaderboard', route => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          route.fulfill({
            status: 500,
            body: JSON.stringify({ success: false, error: { message: 'Server error' } })
          });
        } else {
          // Second call succeeds
          route.fulfill({
            status: 200,
            body: JSON.stringify({
              success: true,
              data: {
                users: [],
                pagination: { currentPage: 1, totalPages: 0, totalUsers: 0, usersPerPage: 20 },
                summary: { totalTokensUsed: 0, totalCost: 0, averagePerUser: 0, mostActiveUser: null }
              }
            })
          });
        }
      });

      await page.goto('/d/statistics/users');
      
      // Should show error first
      const errorMessage = page.locator('text=/Error/i');
      await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
      
      // Click retry button
      const retryButton = page.locator('button:has-text("Try Again"), button:has-text("Retry")');
      await retryButton.first().click();
      
      // Should succeed on retry
      await expect(errorMessage.first()).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Performance and Accessibility', () => {
    test('should load statistics pages within reasonable time', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/d/statistics/users');
      
      // Wait for main content to be visible
      await expect(page.locator('text=/User.*Statistics/i, text=/Leaderboard/i')).toBeVisible();
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds
    });

    test('should have proper page titles', async ({ page }) => {
      await page.goto('/d/statistics/users');
      await expect(page).toHaveTitle(/Statistics|User.*Statistics/i);
      
      await page.goto('/d/statistics/groups');
      await expect(page).toHaveTitle(/Statistics|Group.*Statistics/i);
    });

    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/d/statistics');
      
      // Test tab navigation
      await page.keyboard.press('Tab');
      const focusedElement = await page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    });
  });
});