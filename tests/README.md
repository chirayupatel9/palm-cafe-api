# Palm Cafe API – Test Suite

## Why "All passed" but console shows errors?

Tests **pass** when their **assertions** succeed (e.g. "expect status 401", "expect body to have error").  
The **console** shows logs from the **app** while tests run. Many tests deliberately send bad data (wrong password, invalid token, missing body), so the app logs "Login error", "JWT verification failed", "Error creating order", etc. Those logs are **expected** and do **not** mean the test failed. A test fails only when an `expect(...)` fails.

## Safety

- **Test DB only**: `NODE_ENV=test` forces `DB_NAME=cafe_app_test`. Production DB is never used.
- **No production logic changed**: Only test and setup files were added.
- **Idempotent**: Global setup creates DB if missing, runs `setup-database.js`, then migrations. Re-runs are safe.
- **Credentials**: Use `TEST_LOGIN_EMAIL` / `TEST_LOGIN_PASSWORD` (or `loginEmail` / `loginPassword`) for authenticated tests. Default: `admin@cafe.com` / `admin123` (from setup-database).

## Run

```bash
npm test
npm run test:coverage
```

Report is written to `tests/report/test-report.json` and summarized in the console.

## Coverage

Thresholds in `jest.config.js`: 80% lines, 70% branches. To avoid failure until coverage is raised, you can temporarily lower them in `jest.config.js` or run without `--coverage`.

## Structure

- `setupEnv.js` – Sets NODE_ENV=test, test DB name, test JWT_SECRET.
- `setupDb.js` – Creates test DB, runs full schema + migrations.
- `teardownDb.js` – No-op (no destructive cleanup).
- `utils/authHelper.js` – `loginAndGetToken(app)`, `createTestUserIfNotExists()`.
- `reporters/testReportReporter.js` – Writes test-report.json and console summary.
- `unit/` – Middleware, lib, routes/helpers, services (unit tests).
- `integration/` – API routes (auth, customers, inventory, paymentMethods, metrics, cafe, superadmin).
- `edge/security.test.js` – JWT, validation, SQL-like strings, limits, 404.
- `performance/concurrency.test.js` – 10 parallel requests to /api/menu and /api/health.
- `intensive/*.test.js` – Deeper flows: auth (register, duplicate email, validation), categories (CRUD, duplicate name), orders (full create, list, get by id), customers (list, get, invalid id), role/validation (metrics, payment-methods, boundaries).
