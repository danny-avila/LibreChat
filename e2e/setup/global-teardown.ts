import cleanupUser from './cleanupUser';

async function globalTeardown() {
  const user = {
    email: String(process.env.E2E_USER_EMAIL),
    password: String(process.env.E2E_USER_PASSWORD),
  };

  try {
    await cleanupUser(user);
  } catch (error) {
    console.error('Error:', error);
  }
}

export default globalTeardown;
