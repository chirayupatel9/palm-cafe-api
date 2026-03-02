# Advanced Production Validation Layers

This document describes the resilience, performance, and distributed validation layers added on top of API-level E2E tests.

## 1. Directory Tree of New Testing Layers

```
palm-cafe/
├── palm-cafe-api/
│   ├── lib/
│   │   └── redis.js                    # Optional Redis (rate limit + lockout)
│   ├── middleware/
│   │   ├── rateLimiter.js              # Redis-backed store when REDIS_URL set
│   │   └── accountLockout.js           # Redis-backed lockout when Redis available
│   ├── tests/
│   │   ├── load/
│   │   │   ├── k6-login.js             # 100 concurrent logins
│   │   │   ├── k6-orders.js            # 200 concurrent order creations
│   │   │   ├── k6-mixed.js             # 60% read, 30% orders, 10% admin
│   │   │   └── run-load-tests.js       # Runner; outputs to tests/report/
│   │   ├── chaos/
│   │   │   ├── global-error-handler.test.js   # Force exception → { error, code, requestId }
│   │   │   └── readiness-503-when-db-down.test.js  # DB unavailable → 503
│   │   ├── stress/
│   │   │   └── concurrent-orders.test.js       # Concurrent orders; no negative totals
│   │   └── e2e/
│   │       ├── seedForBrowser.js       # Truncate + seed + menu for browser E2E
│   │       └── seedBrowserMenu.js      # One category + one menu item for browser
│   └── routes/
│       └── index.js                    # /api/chaos/throw (test only)
└── palm-cafe-ui/
    ├── e2e/
    │   ├── global-setup.js             # Start API + seed + start UI
    │   ├── global-teardown.js          # Stop API and UI
    │   ├── login.spec.js
    │   ├── invalid-login.spec.js
    │   ├── z-lockout.spec.js            # Account lockout (runs last)
    │   ├── menu-browse.spec.js
    │   ├── cart-order-invoice.spec.js
    │   ├── registration.spec.js
    │   └── admin-superadmin-impersonation.spec.js
    └── playwright.config.js            # Chromium; real backend
```

## 2. Summary of Failure Scenarios Detected

| Scenario | How tested | Expected behaviour |
|----------|------------|--------------------|
| DB unavailable | Chaos: mock `testConnection` → false | `/api/readiness` returns 503, body `ready: false` |
| Unhandled exception | Chaos: GET `/api/chaos/throw` | 500, body `{ error, code, requestId }`; server does not crash |
| Account lockout | Browser E2E: 5 wrong logins | 429, `ACCOUNT_LOCKED`, UI shows lock message |
| Invalid login | Browser E2E | 401, error message shown, no token stored |
| Concurrent order creation | Stress: 30 concurrent POST /api/orders | Some 201, some 500 (duplicate order_number); no negative totals; order_items consistent with orders |

## 3. Performance Benchmark Numbers

- **Load tests** (k6): Run with API and test DB up. Use `npm run test:load` (or run scripts manually).
  - **Thresholds**: Fail if `http_req_failed` rate ≥ 1% or `p(95)` latency ≥ 1500 ms.
  - **Reports**: Written to `palm-cafe-api/tests/report/` (e.g. `load-login.json`, `load-orders.json`, `load-mixed.json` when using `--out json=...`).
  - Example (run locally and inspect summary):
    - `k6 run tests/load/k6-login.js`
    - `k6 run tests/load/k6-orders.js`
    - `k6 run tests/load/k6-mixed.js`

## 4. Scalability Readiness Assessment

- **Stateless JWT**: Auth uses JWT; no server-side session. Works across instances.
- **Rate limiting**: Optional Redis store (`REDIS_URL` or `REDIS_HOST`). When set, limit state is shared across instances; otherwise in-memory per process.
- **Account lockout**: Uses Redis when available (same client as rate limit); otherwise in-memory Map. Shared across instances when Redis is used.
- **Multi-instance**: Run two API instances (e.g. ports 5000 and 5001) with the same `REDIS_URL`. Login on one, use token on the other; rate limit and lockout apply across both when Redis is configured.

## 5. Architectural Weaknesses Found

1. **Order number collision**: `order_number` is `ORD${Date.now()}`. Under high concurrency, duplicate keys cause 500s. Recommendation: use UUID or DB sequence for `order_number`.
2. **Redis optional**: Without Redis, rate limit and lockout are per-process. For horizontal scaling, Redis should be configured.
3. **Browser E2E**: Lockout test runs last (z-lockout) and uses short `LOCKOUT_DURATION_MS` in setup to avoid affecting other specs.
4. **Stress test**: Excluded from default `npm test` (path ignore). Run with `npm run test:stress`.

## How to Run

| Layer | Command |
|-------|--------|
| Browser E2E (Playwright) | From `palm-cafe-ui`: `npm run test:e2e` (starts API + UI via global-setup) |
| Load (k6) | From `palm-cafe-api`: `npm run test:load` or `k6 run tests/load/k6-mixed.js` |
| Chaos | From `palm-cafe-api`: `npm run test:chaos` |
| Stress | From `palm-cafe-api`: `npm run test:stress` |
| API E2E | From `palm-cafe-api`: `npm run test:e2e` |

Existing unit and E2E tests are unchanged and remain passing.
