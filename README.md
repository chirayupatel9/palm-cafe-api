# Palm Cafe API (TypeScript)

Full TypeScript port of `palm-cafe-api`. Same functionality; original JS project is unchanged.

## Setup

```bash
npm install
cp ../palm-cafe-api/.env .env   # or create from env.example
```

## Build & run

```bash
npm run build
npm start
```

Development (run without building):

```bash
npx ts-node index.ts
```

## Structure

- **Entry:** `index.ts` → compiles to `dist/index.js`
- **Config:** `config/` (database, env, logger, paths, multer)
- **Routes:** All routes from palm-cafe-api: `auth`, `health`, `superadmin`, `menu`, `cafe`, `inventory`, `orders`, `customers`, `metrics`, `paymentMethods`, plus `helpers`.
- **Models:** All models: `user`, `cafe`, `cafeSettings`, `cafeDailyMetrics`, `cafeMetrics`, `order`, `invoice`, `menuItem`, `category`, `customer`, `inventory`, `paymentMethod`, `taxSettings`, `currencySettings`, `promoBanner`, `feature`.
- **Services:** `emailService`, `otpStore`, `featureService`, `subscriptionService`, `impersonationService`, `auditService`, `pdfService`.
- **Middleware:** `auth`, `adminAuth`, `chefAuth`, `rateLimiter`, `accountLockout`, `validateAuth`, `subscriptionAuth`, `onboardingAuth`, `validateInput`, `cafeAuth`, `requestId`, `responseHelpers`, `requestDurationLogger`.
- **Templates:** `templates/email-otp.html`
- **Types:** `types/express.d.ts` extends Express Request/Response.

## Migrations

Reuse the same DB and migrations from `palm-cafe-api`. Point `.env` at the same database.
