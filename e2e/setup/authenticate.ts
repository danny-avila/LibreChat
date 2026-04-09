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
    headless: !!process.env.CI,
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
    await register(page, user);
    try {
      await page.waitForURL(`${baseURL}/c/new`, { timeout });
    } catch (error) {
      console.error('Error:', error);
      const userExists = page.getByTestId('registration-error');
      if (userExists) {
        console.log('🤖: 🚨  user already exists');
        await cleanupUser(user);
        await page.goto(baseURL, { timeout });
        await register(page, user);
      } else {
        throw new Error('🤖: 🚨  user failed to register');
      }
    }
    console.log('🤖: ✔️  user successfully registered');

    // Logout
    // await logout(page);
    // await page.waitForURL(`${baseURL}/login`, { timeout });
    // console.log('🤖: ✔️  user successfully logged out');

    await login(page, user);
    await page.waitForURL(`${baseURL}/c/new`, { timeout });
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
