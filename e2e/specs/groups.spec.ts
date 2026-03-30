import { test, expect } from '@playwright/test';

// Test helpers
async function loginAsAdmin(page: any) {
  const testEmail = process.env.TEST_EMAIL;
  const testPassword = process.env.TEST_PASSWORD;
  
  if (!testEmail || !testPassword) {
    throw new Error('TEST_EMAIL and TEST_PASSWORD environment variables must be set');
  }

  await page.goto('/login');
  await page.fill('input[name="email"]', testEmail);
  await page.fill('input[name="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('/c/new');
}

async function navigateToGroups(page: any) {
  await page.goto('/d/groups');
  await page.waitForSelector('h2:has-text("Groups")');
}

test.describe('Group Management', () => {
  test.beforeEach(async ({ page }) => {
    // Use real authentication
    await loginAsAdmin(page);
  });

  test('should display groups dashboard for admin users', async ({ page }) => {
    await page.goto('/d/groups');
    
    // Check for groups page elements
    await expect(page.locator('h2:has-text("Groups")')).toBeVisible();
    await expect(page.locator('button:has-text("New")')).toBeVisible();
    await expect(page.locator('input[placeholder="Search groups..."]')).toBeVisible();
  });

  test('should navigate to create group form', async ({ page }) => {
    await page.goto('/d/groups');
    
    // Click on New button
    await page.click('button:has-text("New")');
    await page.waitForURL('/d/groups/new');
    
    // Check form elements
    await expect(page.locator('h1:has-text("Create New Group")')).toBeVisible();
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('textarea#description')).toBeVisible();
    await expect(page.locator('button:has-text("Create Group")')).toBeVisible();
  });

  test('should create a new group', async ({ page }) => {
    await page.goto('/d/groups/new');
    
    // Fill in the form
    const groupName = `Test Group ${Date.now()}`;
    await page.fill('input#name', groupName);
    await page.fill('textarea#description', 'This is a test group created by Playwright');
    
    // Mock API response
    await page.route('/api/groups', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Group created successfully',
            data: {
              _id: '123456',
              name: groupName,
              description: 'This is a test group created by Playwright',
              isActive: true,
              memberCount: 0,
              timeWindows: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          })
        });
      }
    });
    
    // Submit the form
    await page.click('button:has-text("Create Group")');
    
    // Should redirect to groups list
    await page.waitForURL('/d/groups');
  });

  test('should display group list', async ({ page }) => {
    // Mock API response for groups list
    await page.route('/api/groups*', async route => {
      if (route.request().method() === 'GET' && !route.request().url().includes('/api/groups/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              groups: [
                {
                  _id: '1',
                  name: 'Engineering Team',
                  description: 'Development team members',
                  isActive: true,
                  memberCount: 15,
                  timeWindows: [],
                  createdAt: '2024-01-01T00:00:00Z',
                  updatedAt: '2024-01-01T00:00:00Z'
                },
                {
                  _id: '2',
                  name: 'Marketing Team',
                  description: 'Marketing department',
                  isActive: false,
                  memberCount: 8,
                  timeWindows: [{ name: 'Business Hours', isActive: true }],
                  createdAt: '2024-01-02T00:00:00Z',
                  updatedAt: '2024-01-02T00:00:00Z'
                }
              ],
              pagination: {
                currentPage: 1,
                totalPages: 1,
                totalItems: 2,
                itemsPerPage: 10
              }
            }
          })
        });
      }
    });

    await page.goto('/d/groups');
    await page.waitForSelector('h3:has-text("Engineering Team")');
    
    // Check that groups are displayed
    await expect(page.locator('h3:has-text("Engineering Team")')).toBeVisible();
    await expect(page.locator('text=15 members')).toBeVisible();
    
    await expect(page.locator('h3:has-text("Marketing Team")')).toBeVisible();
    await expect(page.locator('text=8 members')).toBeVisible();
    await expect(page.locator('text=1 time restrictions')).toBeVisible();
  });

  test('should search for groups', async ({ page }) => {
    // Mock API response for search
    await page.route('/api/groups*', async route => {
      const url = route.request().url();
      if (url.includes('search=marketing')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              groups: [
                {
                  _id: '2',
                  name: 'Marketing Team',
                  description: 'Marketing department',
                  isActive: false,
                  memberCount: 8,
                  timeWindows: [],
                  createdAt: '2024-01-02T00:00:00Z',
                  updatedAt: '2024-01-02T00:00:00Z'
                }
              ],
              pagination: {
                currentPage: 1,
                totalPages: 1,
                totalItems: 1,
                itemsPerPage: 10
              }
            }
          })
        });
      }
    });

    await page.goto('/d/groups');
    
    // Search for marketing
    await page.fill('input[placeholder="Search groups..."]', 'marketing');
    await page.waitForTimeout(500); // Wait for debounce
    
    // Should show only Marketing Team
    await expect(page.locator('h3:has-text("Marketing Team")')).toBeVisible();
    await expect(page.locator('h3:has-text("Engineering Team")')).not.toBeVisible();
  });

  test('should edit an existing group', async ({ page }) => {
    const groupId = '123456';
    
    // Mock API response for getting group
    await page.route(`/api/groups/${groupId}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              _id: groupId,
              name: 'Original Group Name',
              description: 'Original description',
              isActive: true,
              memberCount: 5,
              timeWindows: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z'
            }
          })
        });
      } else if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Group updated successfully',
            data: {
              _id: groupId,
              name: 'Updated Group Name',
              description: 'Updated description',
              isActive: false,
              memberCount: 5,
              timeWindows: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: new Date().toISOString()
            }
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    await page.waitForSelector('h1:has-text("Edit Group")');
    
    // Update the form
    await page.fill('input#name', 'Updated Group Name');
    await page.fill('textarea#description', 'Updated description');
    
    // Toggle active status
    await page.click('button:has-text("Group Active")');
    
    // Submit the form
    await page.click('button:has-text("Update Group")');
    
    // Should redirect to groups list
    await page.waitForURL('/d/groups');
  });

  test('should delete a group', async ({ page }) => {
    const groupId = '123456';
    
    // Mock API responses
    await page.route(`/api/groups/${groupId}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              _id: groupId,
              name: 'Group to Delete',
              description: 'This group will be deleted',
              isActive: true,
              memberCount: 0,
              timeWindows: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z'
            }
          })
        });
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Group deleted successfully'
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    await page.waitForSelector('h1:has-text("Edit Group")');
    
    // Handle confirmation dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Click delete button
    await page.click('button:has-text("Delete")');
    
    // Should redirect to groups list
    await page.waitForURL('/d/groups');
  });

  test('should show empty state when no groups exist', async ({ page }) => {
    // Mock API response with empty groups
    await page.route('/api/groups*', async route => {
      if (route.request().method() === 'GET' && !route.request().url().includes('/api/groups/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              groups: [],
              pagination: {
                currentPage: 1,
                totalPages: 0,
                totalItems: 0,
                itemsPerPage: 10
              }
            }
          })
        });
      }
    });

    // Mock stats API
    await page.route('/api/groups/stats', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            totalGroups: 0,
            activeGroups: 0,
            totalMembers: 0,
            averageMembersPerGroup: 0,
            groupsWithTimeWindows: 0
          }
        })
      });
    });

    await page.goto('/d/groups');
    
    // Check empty state
    await expect(page.locator('h2:has-text("Group Management")')).toBeVisible();
    await expect(page.locator('text=Create and manage user groups')).toBeVisible();
    await expect(page.locator('button:has-text("Create First Group")')).toBeVisible();
  });

  test('should validate form inputs', async ({ page }) => {
    await page.goto('/d/groups/new');
    
    // Try to submit empty form
    await page.click('button:has-text("Create Group")');
    
    // Should show validation error
    await expect(page.locator('text=Group name is required')).toBeVisible();
    
    // Enter a very long name (over 100 characters)
    const longName = 'A'.repeat(101);
    await page.fill('input#name', longName);
    await page.click('button:has-text("Create Group")');
    
    // Should show length validation error
    await expect(page.locator('text=Group name must be less than 100 characters')).toBeVisible();
    
    // Enter valid name but very long description
    await page.fill('input#name', 'Valid Group Name');
    const longDescription = 'B'.repeat(501);
    await page.fill('textarea#description', longDescription);
    await page.click('button:has-text("Create Group")');
    
    // Should show description length error
    await expect(page.locator('text=Description must be less than 500 characters')).toBeVisible();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error response
    await page.route('/api/groups', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            message: 'Internal server error'
          })
        });
      }
    });

    await page.goto('/d/groups/new');
    
    // Fill and submit form
    await page.fill('input#name', 'Test Group');
    await page.fill('textarea#description', 'Test description');
    await page.click('button:has-text("Create Group")');
    
    // Should stay on the same page (not redirect)
    await expect(page).toHaveURL('/d/groups/new');
  });

  test('should deny access for non-admin users', async ({ page }) => {
    // Override with non-admin user
    await page.addInitScript(() => {
      localStorage.setItem('token', 'mock-user-token');
      localStorage.setItem('user', JSON.stringify({
        id: '456',
        email: 'user@example.com',
        role: 'user',
        name: 'Regular User'
      }));
    });

    await page.goto('/d/groups');
    
    // Should redirect to chat or show access denied
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL('/c/new');
  });
});

test.describe('Time Window Management', () => {
  test.beforeEach(async ({ page }) => {
    // Use real authentication
    await loginAsAdmin(page);
  });

  test('should display time window management section in group edit', async ({ page }) => {
    const groupId = '123456';
    
    // Mock API response for getting group
    await page.route(`/api/groups/${groupId}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              _id: groupId,
              name: 'Test Group',
              description: 'Test group for time windows',
              isActive: true,
              memberCount: 5,
              timeWindows: [
                {
                  _id: 'tw1',
                  name: 'Business Hours',
                  windowType: 'weekly',
                  startTime: '09:00',
                  endTime: '17:00',
                  daysOfWeek: [1, 2, 3, 4, 5],
                  timezone: 'UTC',
                  isActive: true
                }
              ],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z'
            }
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    await page.waitForSelector('h1:has-text("Edit Group")');
    
    // Check time window section is visible
    await expect(page.locator('h3:has-text("Time Windows")')).toBeVisible();
    await expect(page.locator('text=Configure when members of this group can access the system')).toBeVisible();
    await expect(page.locator('button:has-text("Add Window")')).toBeVisible();
    
    // Check existing time window is displayed
    await expect(page.locator('text=Business Hours')).toBeVisible();
    await expect(page.locator('text=Weekly')).toBeVisible();
    await expect(page.locator('text=Mon, Tue, Wed, Thu, Fri 09:00 - 17:00')).toBeVisible();
  });

  test('should create a new time window', async ({ page }) => {
    const groupId = '123456';
    
    // Mock group API response
    await page.route(`/api/groups/${groupId}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              _id: groupId,
              name: 'Test Group',
              description: 'Test group',
              isActive: true,
              memberCount: 0,
              timeWindows: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z'
            }
          })
        });
      }
    });

    // Mock time window creation API
    await page.route(`/api/groups/${groupId}/time-windows`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Time window added successfully',
            data: {
              _id: groupId,
              name: 'Test Group',
              timeWindows: [{
                _id: 'new-tw',
                name: 'Daily Work Hours',
                windowType: 'daily',
                startTime: '08:00',
                endTime: '18:00',
                timezone: 'UTC',
                isActive: true
              }]
            }
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    await page.waitForSelector('h1:has-text("Edit Group")');
    
    // Click Add Window button
    await page.click('button:has-text("Add Window")');
    
    // Check form is displayed
    await expect(page.locator('h3:has-text("Add Time Window")')).toBeVisible();
    await expect(page.locator('text=Configure when group members can access the system')).toBeVisible();
    
    // Fill in the form
    await page.fill('input#name', 'Daily Work Hours');
    
    // Select window type (should be daily by default)
    await expect(page.locator('[data-testid=window-type-select]')).toContainText('Daily');
    
    // Set times
    await page.fill('input#startTime', '08:00');
    await page.fill('input#endTime', '18:00');
    
    // Submit form
    await page.click('button:has-text("Create Window")');
    
    // Should show the new time window in the list
    await expect(page.locator('text=Daily Work Hours')).toBeVisible();
  });

  test('should create weekly time window with day selection', async ({ page }) => {
    const groupId = '123456';
    
    // Mock APIs
    await page.route(`/api/groups/${groupId}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              _id: groupId,
              name: 'Test Group',
              timeWindows: [],
              memberCount: 0,
              isActive: true
            }
          })
        });
      }
    });

    await page.route(`/api/groups/${groupId}/time-windows`, async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { timeWindows: [] }
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    await page.click('button:has-text("Add Window")');
    
    // Fill basic info
    await page.fill('input#name', 'Weekday Hours');
    
    // Change to weekly
    await page.click('[data-testid=window-type-select]');
    await page.click('text=Weekly - Specific days of the week');
    
    // Set times
    await page.fill('input#startTime', '09:00');
    await page.fill('input#endTime', '17:00');
    
    // Select weekdays (Mon-Fri should be selected by default)
    await expect(page.locator('button:has-text("Mon")')).toHaveClass(/default/);
    await expect(page.locator('button:has-text("Tue")')).toHaveClass(/default/);
    await expect(page.locator('button:has-text("Wed")')).toHaveClass(/default/);
    await expect(page.locator('button:has-text("Thu")')).toHaveClass(/default/);
    await expect(page.locator('button:has-text("Fri")')).toHaveClass(/default/);
    
    // Unselect Friday and select Saturday
    await page.click('button:has-text("Fri")');
    await page.click('button:has-text("Sat")');
    
    // Submit
    await page.click('button:has-text("Create Window")');
  });

  test('should validate time window form inputs', async ({ page }) => {
    const groupId = '123456';
    
    await page.route(`/api/groups/${groupId}`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { _id: groupId, timeWindows: [], isActive: true, memberCount: 0 }
        })
      });
    });

    await page.goto(`/d/groups/${groupId}`);
    await page.click('button:has-text("Add Window")');
    
    // Try to submit empty form
    await page.click('button:has-text("Create Window")');
    
    // Should show validation errors
    await expect(page.locator('text=Time window name is required')).toBeVisible();
    
    // Fill name and try invalid time range
    await page.fill('input#name', 'Test Window');
    await page.fill('input#startTime', '17:00');
    await page.fill('input#endTime', '09:00');
    await page.click('button:has-text("Create Window")');
    
    // Should show time validation error
    await expect(page.locator('text=End time must be after start time')).toBeVisible();
  });

  test('should work correctly in dark mode', async ({ page }) => {
    const groupId = '123456';
    
    // Set dark mode
    await page.addInitScript(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });
    
    await page.route(`/api/groups/${groupId}`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json', 
        body: JSON.stringify({
          success: true,
          data: { _id: groupId, timeWindows: [], isActive: true, memberCount: 0 }
        })
      });
    });

    await page.goto(`/d/groups/${groupId}`);
    await page.click('button:has-text("Add Window")');
    
    // Click on window type dropdown
    await page.click('[data-testid=window-type-select]');
    
    // Check that dropdown options are visible and readable in dark mode
    const dailyOption = page.locator('text=Daily - Same time every day');
    const weeklyOption = page.locator('text=Weekly - Specific days of the week');
    const dateRangeOption = page.locator('text=Date Range - Specific date period');
    const exceptionOption = page.locator('text=Exception - Block access on specific dates');
    
    // Verify options are visible
    await expect(dailyOption).toBeVisible();
    await expect(weeklyOption).toBeVisible();
    await expect(dateRangeOption).toBeVisible();
    await expect(exceptionOption).toBeVisible();
    
    // Test that we can select options (they should have proper contrast)
    await page.click('text=Weekly - Specific days of the week');
    
    // Test timezone dropdown in dark mode
    await page.click('[data-testid=timezone-select]');
    await expect(page.locator('text=UTC')).toBeVisible();
    await expect(page.locator('text=America/New_York')).toBeVisible();
    await page.click('text=America/New_York');
    
    // Verify the selected values are visible
    await expect(page.locator('[data-testid=window-type-select]')).toContainText('Weekly');
    await expect(page.locator('[data-testid=timezone-select]')).toContainText('America/New_York');
  });

  test('should edit existing time window', async ({ page }) => {
    const groupId = '123456';
    const windowId = 'tw1';
    
    await page.route(`/api/groups/${groupId}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              _id: groupId,
              timeWindows: [{
                _id: windowId,
                name: 'Original Window',
                windowType: 'daily',
                startTime: '09:00',
                endTime: '17:00',
                timezone: 'UTC',
                isActive: true
              }],
              isActive: true,
              memberCount: 0
            }
          })
        });
      }
    });

    await page.route(`/api/groups/${groupId}/time-windows/${windowId}`, async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Time window updated successfully'
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    
    // Click edit button for the time window
    await page.click('button[title="Edit time window"]');
    
    // Should show edit form
    await expect(page.locator('h3:has-text("Edit Time Window")')).toBeVisible();
    await expect(page.locator('input#name')).toHaveValue('Original Window');
    
    // Update the window
    await page.fill('input#name', 'Updated Window Name');
    await page.fill('input#startTime', '08:00');
    await page.fill('input#endTime', '18:00');
    
    // Submit changes
    await page.click('button:has-text("Update Window")');
  });

  test('should delete time window', async ({ page }) => {
    const groupId = '123456';
    const windowId = 'tw1';
    
    await page.route(`/api/groups/${groupId}`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: groupId,
            timeWindows: [{
              _id: windowId,
              name: 'Window to Delete',
              windowType: 'daily',
              isActive: true
            }],
            isActive: true,
            memberCount: 0
          }
        })
      });
    });

    await page.route(`/api/groups/${groupId}/time-windows/${windowId}`, async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Time window removed successfully'
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    
    // Handle confirmation dialog
    page.on('dialog', dialog => dialog.accept());
    
    // Click delete button
    await page.click('button[title="Delete time window"]');
    
    // Window should be removed from list
    await expect(page.locator('text=Window to Delete')).not.toBeVisible();
  });

  test('should toggle time window active status', async ({ page }) => {
    const groupId = '123456';
    const windowId = 'tw1';
    
    await page.route(`/api/groups/${groupId}`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            _id: groupId,
            timeWindows: [{
              _id: windowId,
              name: 'Toggle Window',
              windowType: 'daily',
              isActive: true
            }],
            isActive: true,
            memberCount: 0
          }
        })
      });
    });

    await page.route(`/api/groups/${groupId}/time-windows/${windowId}`, async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { timeWindows: [] }
          })
        });
      }
    });

    await page.goto(`/d/groups/${groupId}`);
    
    // Should show as active initially
    await expect(page.locator('[title="Disable window"]')).toBeVisible();
    
    // Click toggle button
    await page.click('[title="Disable window"]');
    
    // Should update to disabled state
    await expect(page.locator('text=Disabled')).toBeVisible();
  });
});