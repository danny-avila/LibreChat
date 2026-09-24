import { chromium } from '@playwright/test';
import type { FullConfig, Page } from '@playwright/test';
import type { User } from '../types';
import cleanupUser from './cleanupUser';
import dotenv from 'dotenv';
dotenv.config();

const timeout = Number(process.env.E2E_AUTH_TIMEOUT ?? 15000);
const chromiumChannel = process.env.E2E_CHROMIUM_CHANNEL || undefined;

async function registerViaApi(page: Page, user: User) {
  return page.evaluate(async (payload) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }

    return {
      ok: response.ok,
      status: response.status,
      text,
      json,
    };
  }, {
    name: user.name,
    email: user.email,
    password: user.password,
    confirm_password: user.password,
  });
}

async function loginViaApi(page: Page, user: User) {
  return page.evaluate(async (payload) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }

    return {
      ok: response.ok,
      status: response.status,
      text,
      json,
    };
  }, { email: user.email, password: user.password });
}

function appURL(baseURL: string, pathname = '') {
  const normalizedBaseURL = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  return new URL(pathname.replace(/^\/+/, ''), normalizedBaseURL).toString();
}

async function authenticate(config: FullConfig, user: User) {
  console.log('🤖: global setup has been started');
  const { baseURL, storageState } = config.projects[0].use;
  console.log('🤖: using baseURL', baseURL);
  console.log('🤖: using E2E user:', user.email);
  if (typeof storageState !== 'string') {
    throw new Error('🤖: storageState must be a file path');
  }

  const browser = await chromium.launch({
    headless: config.projects[0].use.headless ?? true,
    ...(chromiumChannel ? { channel: chromiumChannel } : {}),
  });
  try {
    const page = await browser.newPage();
    console.log('🤖: 🗝  authenticating user:', user.email);

    if (typeof baseURL !== 'string') {
      throw new Error('🤖: baseURL is not defined');
    }
    const conversationURL = appURL(baseURL, 'c/new');

    // Set localStorage before navigating to the page
    await page.context().addInitScript(() => {
      localStorage.setItem('navVisible', 'true');
    });
    console.log('🤖: ✔️  localStorage: set Nav as Visible', storageState);

    await page.goto(baseURL, { timeout });

    let registrationResponse = await registerViaApi(page, user);
    if (!registrationResponse.ok) {
      if (registrationResponse.status === 400 || registrationResponse.status === 409) {
        console.log('🤖: 🚨  user already exists');
        await cleanupUser(user);
        registrationResponse = await registerViaApi(page, user);
      }
    }

    if (!registrationResponse.ok) {
      throw new Error(
        `🤖: 🚨  registration API failed (${registrationResponse.status}): ${registrationResponse.text}`,
      );
    }
    console.log('🤖: ✔️  user successfully registered');

    const loginResponse = await loginViaApi(page, user);
    if (!loginResponse.ok) {
      throw new Error(
        `🤖: 🚨  login API failed after registration (${loginResponse.status}): ${loginResponse.text}`,
      );
    }

    await page.goto(conversationURL, { timeout });

    console.log('🤖: ✔️  user successfully authenticated');

    await page.context().storageState({ path: storageState });
    console.log('🤖: ✔️  authentication state successfully saved in', storageState);
    // await browser.close();
    // console.log('🤖: global setup has been finished');
  } finally {
    await browser.close();
    console.log('🤖: global setup has been finished');
  }
}

export default authenticate;
