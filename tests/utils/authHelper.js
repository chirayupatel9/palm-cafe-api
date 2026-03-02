/**
 * Auth helper for integration tests: login once, reuse JWT across suites.
 * Uses TEST_LOGIN_EMAIL / TEST_LOGIN_PASSWORD or falls back to default admin.
 */

const DEFAULT_TEST_EMAIL = 'admin@cafe.com';
const DEFAULT_TEST_PASSWORD = 'admin123';

/**
 * Login via POST /api/auth/login and return JWT token.
 * @param {Object} request - supertest request (e.g. request(app))
 * @returns {Promise<string>} JWT token
 */
async function loginAndGetToken(request) {
  const email = process.env.TEST_LOGIN_EMAIL || process.env.loginEmail || DEFAULT_TEST_EMAIL;
  const password = process.env.TEST_LOGIN_PASSWORD || process.env.loginPassword || DEFAULT_TEST_PASSWORD;
  const res = await request
    .post('/api/auth/login')
    .send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} - ${JSON.stringify(res.body)}`);
  }
  if (!res.body.token) {
    throw new Error('Login response missing token');
  }
  return res.body.token;
}

/**
 * Ensure a test user exists (e.g. default admin from migrations).
 * Tests rely on setupDb/migrations to create default admin; this is a no-op placeholder
 * for documentation. If you need a specific test user, create via API or DB in setup.
 */
async function createTestUserIfNotExists() {
  // Default admin is created by database init/migrations; no-op here
  return Promise.resolve();
}

module.exports = {
  loginAndGetToken,
  createTestUserIfNotExists,
  DEFAULT_TEST_EMAIL,
  DEFAULT_TEST_PASSWORD
};
