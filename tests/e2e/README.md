# E2E Regression Suite

Full integration tests using **real HTTP** (Supertest) and **real database** (`cafe_app_test`). No mocks of services or DB.

## Run

```bash
npm run test:e2e
```

- Uses `jest.e2e.config.js` (globalSetup, truncate+seed per suite, `maxWorkers: 1`).
- **Do not** run E2E with the default `npm test`; they are excluded via `testPathIgnorePatterns` so the main suite does not truncate the DB.

## Directory layout

```
tests/e2e/
├── README.md           # This file
├── setup.js            # afterAll: close DB pool (no open handles)
├── truncateDb.js       # Truncate all app tables except migrations, features
├── seedE2e.js          # Seed default cafe + superadmin + admin
├── auth.e2e.test.js
├── tenantIsolation.e2e.test.js
├── orderFlow.e2e.test.js
├── subscription.e2e.test.js
├── superadmin.e2e.test.js
└── health.e2e.test.js
```

## Flows covered

| Suite | Flows |
|-------|--------|
| **auth** | Register, login, protected route with token, invalid token 401, expired token 401, account lockout (429 or 401/500) |
| **tenantIsolation** | Create Cafe A & B, user A cannot see Cafe B orders, cafe_id scoping on list |
| **orderFlow** | Category → menu item → customer → order → order_items → invoice → payment (status completed), inventory stock update |
| **subscription** | Disable feature → 403, enable → 200 |
| **superadmin** | Login, create cafe, impersonate, impersonation token works, audit log entry |
| **health** | GET /api/health 200, GET /api/readiness 200, error shape (error, code, requestId) |

## Setup

- **beforeAll**: `truncateDb()` then `seedE2e()` (idempotent) so each suite has default cafe + e2e-superadmin + e2e-admin.
- **afterAll** (in `setup.js`): close DB pool so Jest exits without open handles.
- `features` table is **not** truncated so feature flags from migrations remain.
- Account lockout timer uses `.unref()` so it does not keep the process alive.

## Notes

- **Readiness 503**: “Simulate DB failure → readiness 503” is not implemented (would require closing the shared pool and breaking other tests). Health suite only asserts 200 when DB is up and error shape for 404.
- **Default registration**: Register uses `Cafe.getFirstActive()` when `cafe_id` is not provided so new users get a default cafe in multi-tenant setups.
- **JWT in superadmin**: `routes/superadmin.js` now requires `jsonwebtoken` and `JWT_SECRET` for impersonation tokens.

## New files (created)

- `tests/e2e/setup.js`
- `tests/e2e/truncateDb.js`
- `tests/e2e/seedE2e.js`
- `tests/e2e/auth.e2e.test.js`
- `tests/e2e/tenantIsolation.e2e.test.js`
- `tests/e2e/orderFlow.e2e.test.js`
- `tests/e2e/subscription.e2e.test.js`
- `tests/e2e/superadmin.e2e.test.js`
- `tests/e2e/health.e2e.test.js`
- `jest.e2e.config.js`

## Modified (for E2E / stability)

- `index.js`: unchanged (app already exported).
- `jest.config.js`: `testPathIgnorePatterns: ['/tests/e2e/']` so default `npm test` skips E2E.
- `middleware/accountLockout.js`: cleanup timer `.unref()` to avoid open handles.
- `routes/auth.js`: optional default cafe for register; `Cafe` required.
- `routes/superadmin.js`: `jwt` and `JWT_SECRET` for impersonation.
- `tests/unit/routes/auth.test.js`: mock `models/cafe`, `User.create` expectation with `objectContaining`.
- `package.json`: script `test:e2e`.
