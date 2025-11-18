import { Page, FullConfig, chromium } from '@playwright/test';
import type { User } from '../types';
import cleanupUser from './cleanupUser';
import dotenv from 'dotenv';
dotenv.config();

const timeout = 6000;

async function register(page: Page, user: User) {
  await page.getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Full name').click();
  await page.getByLabel('Full name').fill('test');
  await page.getByText('Username (optional)').click();
  await page.getByLabel('Username (optional)').fill('test');
  await page.getByLabel('Email').click();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Email').press('Tab');
  await page.getByTestId('password').click();
  await page.getByTestId('password').fill(user.password);
  await page.getByTestId('confirm_password').click();
  await page.getByTestId('confirm_password').fill(user.password);
  await page.getByLabel('Submit registration').click();
}

async function logout(page: Page) {
  await page.getByTestId('nav-user').click();
  await page.getByRole('button', { name: 'Log out' }).click();
}

async function login(page: Page, user: User) {
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('input[name="password"]').press('Enter');
}

async function authenticate(config: FullConfig, user: User) {
  console.log('🤖: global setup has been started');
  const { baseURL, storageState } = config.projects[0].use;
  console.log('🤖: using baseURL', baseURL);
  console.dir(user, { depth: null });
  const browser = await chromium.launch({
    headless: process.env.CI ? true : false,
  });
  try {
    const page = await browser.newPage();
    console.log('🤖: 🗝  authenticating user:', user.email);

    if (!baseURL) {
      throw new Error('🤖: baseURL is not defined');
    }

    // Set localStorage before navigating to the page
    await page.context().addInitScript(() => {
      localStorage.setItem('navVisible', 'true');
    });
    console.log('🤖: ✔️  localStorage: set Nav as Visible', storageState);

    await page.goto(baseURL, { timeout });

    // Check if user is already authenticated
    const isAlreadyAuthenticated = page.url().includes('/c/new') || page.url().includes('/chat');
    if (isAlreadyAuthenticated) {
      console.log('🤖: ✔️  user already authenticated, skipping registration');
    } else {
      // Check if we're on login page or home page
      const signUpLink = page.getByRole('link', { name: 'Sign up' });
      const isSignUpVisible = await signUpLink.isVisible({ timeout: 5000 }).catch(() => false);

      if (isSignUpVisible) {
        await register(page, user);
        try {
          await page.waitForURL(`${baseURL}/c/new`, { timeout });
        } catch (error) {
          console.error('Registration error:', error);
          const userExists = page.getByTestId('registration-error');
          if (await userExists.isVisible().catch(() => false)) {
            console.log('🤖: 🚨  user already exists, attempting cleanup');
            await cleanupUser(user);
            await page.goto(baseURL, { timeout });
            await register(page, user);
          } else {
            // Maybe we need to login instead
            console.log('🤖: 🚨  registration failed, trying to login instead');
            await page.goto(`${baseURL}/login`, { timeout });
            await login(page, user);
          }
        }
      } else {
        console.log('🤖: Sign up link not found, trying to login directly');
        await page.goto(`${baseURL}/login`, { timeout });
        await login(page, user);
      }
    }
    console.log('🤖: ✔️  user successfully registered');

    // If not already authenticated, perform login
    if (!page.url().includes('/c/new') && !page.url().includes('/chat')) {
      console.log('🤖: 🗝  performing login');
      await page.goto(`${baseURL}/login`, { timeout });
      await login(page, user);
      await page.waitForURL(`${baseURL}/c/new`, { timeout });
    }

    console.log('🤖: ✔️  user successfully authenticated');

    await page.context().storageState({ path: storageState as string });
    console.log('🤖: ✔️  authentication state successfully saved in', storageState);
    // await browser.close();
    // console.log('🤖: global setup has been finished');
  } finally {
    await browser.close();
    console.log('🤖: global setup has been finished');
  }
}

export default authenticate;
