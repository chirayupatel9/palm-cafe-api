# Production-Readiness & Security Audit Report
## Palm Cafe API

**Auditor:** Senior Staff Engineer / Security Auditor
**Date:** 2026-02-24
**Codebase:** Node.js / Express / MySQL2
**Scope:** Full production-readiness audit across Security, Bugs, Performance, Code Quality, and Observability

---

## Executive Summary

The Palm Cafe API is a multi-tenant café management system with solid architectural intentions, but contains **5 critical security vulnerabilities** that must be resolved before any production deployment at scale. The most severe issue — **dynamic SQL column injection** — allows any authenticated admin to arbitrarily modify any column in the `cafe_settings` table. Additionally, the default admin account initialisation, broken privilege escalation on the admin registration endpoint, and unauthenticated WebSocket access each represent serious breach vectors.

Beyond security, there are significant performance anti-patterns (per-request `INFORMATION_SCHEMA` queries), a monolithic 7,245-line entry file with 265 `console.*` calls mixed alongside Winston, and a CI/CD pipeline that deploys with zero test coverage and causes downtime on every release.

**Recommended action:** Block deployment until Critical and High findings are resolved.

---

## Severity Legend

| Label | Meaning |
|---|---|
| 🔴 Critical | Exploitable right now, data breach or full compromise possible |
| 🟠 High | Serious vulnerability or reliability risk, fix before go-live |
| 🟡 Improvement | Notable quality/performance issue, fix in current sprint |
| 🟢 Enhancement | Best-practice gap, schedule in upcoming sprint |

---

# 🔴 Critical Issues

---

### CRIT-1: SQL Column Injection in Settings Update Endpoint

**File:** `index.js:893–941` (also `index.js:917–944`, `index.js:1139–1147`)
**Endpoint:** `PUT /api/superadmin/cafes/:id/settings`

**Explanation:**
`Object.keys(settingsData)` from the raw request body is used to construct SQL column names directly in a template literal. While parameter values are correctly bound via `?` placeholders, **column names are never validated against an allowlist**. An attacker with Super Admin credentials (or an escalated admin, see CRIT-3) can inject arbitrary SQL through key names.

```js
// index.js:893-896 — VULNERABLE
const updateFields = Object.keys(settingsData)
  .filter(key => key !== 'id' && key !== 'cafe_id' && ...)
  .map(key => `${key} = ?`)   // ← column name injected verbatim
  .join(', ');
```

**Why it matters:**
A crafted key like `is_active = TRUE, subscription_plan = 'PRO'` or even `` `a` = 1, (SELECT SLEEP(5)) `` is injected into the final SQL string, enabling boolean-based blind injection, sleep-based timing attacks, and schema manipulation across all tables accessible from the application DB user.

**Fix:**
```js
// Define every column that can legitimately be updated
const ALLOWED_SETTINGS_COLUMNS = new Set([
  'cafe_name', 'logo_url', 'hero_image_url', 'promo_banner_url',
  'primary_color', 'accent_color', 'printer_enabled', 'tab_visibility',
  // ... exhaustive list
]);

const updateFields = Object.keys(settingsData)
  .filter(key => ALLOWED_SETTINGS_COLUMNS.has(key))
  .map(key => `\`${key}\` = ?`)
  .join(', ');

if (!updateFields) {
  return res.status(400).json({ error: 'No valid fields to update' });
}
```

---

### CRIT-2: Privilege Escalation — Any Authenticated User Can Create Admin Accounts

**File:** `index.js:443`
**Endpoint:** `POST /api/auth/register-admin`

**Explanation:**
The register-admin endpoint uses only `auth` middleware (any valid JWT), not `adminAuth`. Any customer, chef, or reception user with a valid token can call this endpoint to register a new `admin`-role account.

```js
// index.js:443 — BROKEN: `auth` should be `adminAuth`
app.post('/api/auth/register-admin', auth, async (req, res) => {
  // ...
  const user = await User.create({ username, email, password, role: 'admin' });
```

**Why it matters:**
A customer account (obtainable via `POST /api/auth/register`) can immediately escalate to full admin privileges by calling this endpoint. This bypasses the entire RBAC model.

**Fix:**
```js
app.post('/api/auth/register-admin', auth, requireSuperAdmin, async (req, res) => {
```
Only Super Admins should be able to create admin accounts. Cafe admins creating staff should use `POST /api/users`.

---

### CRIT-3: Hardcoded Default Admin Credentials Inserted at Init

**File:** `config/database.js:129–140`

**Explanation:**
On first boot, the database is seeded with a default admin user (`admin` / `admin123`) if the users table is empty. This is logged in plaintext to stdout.

```js
// config/database.js:133-140
const hashedPassword = await bcrypt.hash('admin123', 10);
await connection.execute(
  'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
  ['admin', 'admin@cafe.com', hashedPassword, 'admin']
);
console.log('Default admin user created (username: admin, password: admin123)');
```

**Why it matters:**
`admin123` is one of the first passwords in any credential-stuffing list. Production deployments will be compromised immediately if the default password is not changed. There is no force-reset mechanism.

**Fix:**
Remove automatic user seeding entirely. Generate a cryptographically random initial password and require it be set at first login via a setup wizard, or document a manual bootstrap step (`node scripts/create-first-superadmin.js`) that forces the operator to choose a strong password.

```js
// Remove the default user insertion block from initializeDatabase()
// It exists already in scripts/create-first-superadmin.js — use that instead
```

---

### CRIT-4: WebSocket Endpoint Has No Authentication

**File:** `websocket.js:11–36`
**Endpoint:** `ws://<host>:<port>/ws/orders`

**Explanation:**
Any unauthenticated client that connects to `/ws/orders` immediately receives a `connected` confirmation and then all subsequent real-time order broadcasts, including customer names, phone numbers, order contents, and financial totals.

```js
// websocket.js:11 — no token check before accepting connection
this.wss.on('connection', (ws, req) => {
  this.clients.add(ws); // ← no authentication
```

**Why it matters:**
This leaks PII (customer phone numbers), business data (order volumes, revenue patterns), and internal identifiers to any internet-accessible client. The WebSocket is on the same port as the HTTP server and protected only by network-level controls, which may not exist.

**Fix:**
```js
this.wss.on('connection', async (ws, req) => {
  // Parse token from query string: ws://host/ws/orders?token=<jwt>
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) { ws.close(1008, 'Invalid token'); return; }
    ws.cafeId = user.cafe_id; // scope broadcasts to this cafe
    this.clients.add(ws);
    // ...
  } catch {
    ws.close(1008, 'Invalid token');
  }
});
```

---

### CRIT-5: Server-Side Path Traversal in PDF Invoice Logo Loading

**File:** `index.js:243–248`

**Explanation:**
`cafeSettings.logo_url` is fetched from the database and used to construct a filesystem path without any sanitisation before being passed to `doc.image()` (PDFKit's file reader).

```js
// index.js:243-246
const logoPath = cafeSettings.logo_url.startsWith('/') ?
  `./public${cafeSettings.logo_url}` :
  `./public/images/${cafeSettings.logo_url}`;
doc.image(logoPath, ...);  // ← arbitrary file read
```

If a `logo_url` value of `/../../../etc/passwd` is stored in the database (achievable by a compromised admin), PDFKit will attempt to open and embed `/etc/passwd` in the generated invoice PDF.

**Why it matters:**
This is a server-side file read via path traversal. Sensitive server files (credentials, environment files, private keys) could be exfiltrated into customer-facing PDFs.

**Fix:**
```js
const IMAGES_DIR = path.resolve(__dirname, 'public', 'images');

function safeLogoPath(logoUrl) {
  if (!logoUrl) return null;
  const resolved = path.resolve(IMAGES_DIR, path.basename(logoUrl));
  if (!resolved.startsWith(IMAGES_DIR)) return null;
  return resolved;
}

const logoPath = safeLogoPath(cafeSettings.logo_url);
if (logoPath && fs.existsSync(logoPath)) {
  doc.image(logoPath, margin, 10, { width: 50, height: 50 });
}
```

---

# 🟠 High Priority Issues

---

### HIGH-1: Excessive JWT Clock Tolerance Extends Token Lifetime by 10 Minutes

**File:** `middleware/auth.js:20–23`

**Explanation:**
`clockTolerance: 600` allows tokens that expired up to 10 minutes ago to still be accepted. The standard tolerance for NTP drift is 30–60 seconds, not 600 seconds.

```js
const decoded = jwt.verify(token, JWT_SECRET, {
  clockTolerance: 600, // ← 10 minutes is excessive
  ignoreExpiration: false
});
```

**Why it matters:**
A stolen token from a session that was logged out remains usable for 10 additional minutes after its official expiry. Combined with the absence of token revocation, this significantly extends the attack window.

**Fix:** Reduce to `clockTolerance: 30` (30 seconds). If timezone issues genuinely exist, fix the root cause (server clock sync via NTP) rather than using tolerance as a workaround.

---

### HIGH-2: Auth Rate Limiter Values Are Effectively Useless

**File:** `middleware/rateLimiter.js:23–38`

**Explanation:**
The comment says "5 requests per windowMs" but the implementation allows **5,000 login attempts per 5 minutes** per IP. The general limiter allows **10,000 requests per 5 minutes**.

```js
// rateLimiter.js:24-25
// comment: "limit each IP to 5 requests per windowMs"
max: 5000,  // ← actual limit: 5,000 auth attempts
```

At 5,000 attempts per 5 minutes, an attacker can brute-force a 6-character lowercase alphabetic password in a single window.

**Fix:**
```js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per 15 min per IP
  skipSuccessfulRequests: true,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
});
```

Also add account-level lockout after N failed attempts by recording failed login counts in the database.

---

### HIGH-3: Disabled Users Can Still Authenticate

**File:** `models/user.js:62–90`, `middleware/auth.js:25`

**Explanation:**
When a user is soft-deleted (`is_active = 0`), their JWT remains valid. The `auth` middleware calls `User.findById()` which does not filter on `is_active`, so disabled accounts authenticate successfully for the remaining token lifetime (24 hours).

```js
// models/user.js:76 — no is_active filter
const query = 'SELECT id, username, email, role, cafe_id, created_at FROM users WHERE id = ?';
```

**Why it matters:**
A fired employee whose account is disabled can continue to access the system for up to 24 hours.

**Fix:**
```js
// models/user.js — add is_active check
const query = 'SELECT id, username, email, role, cafe_id, created_at FROM users WHERE id = ? AND is_active = 1';
```
Also implement a token denylist (Redis-backed or DB-backed) that is checked on every request for high-privilege operations.

---

### HIGH-4: SVG Image Uploads Enable Stored XSS

**File:** `index.js:88–100`, `index.js:4848–4850`

**Explanation:**
The image upload filter allows any `image/` MIME type including `image/svg+xml`. SVG files are XML documents that can contain `<script>` tags. When served from `/images/`, the browser executes the embedded JavaScript in the context of the domain.

```js
// index.js:94-97 — allows SVG
if (file.mimetype.startsWith('image/')) {
  cb(null, true);
}
```

**Why it matters:**
An attacker with admin access uploads a malicious SVG logo. Any user who views the PDF invoice or the admin dashboard where the logo is displayed has their session token stolen.

**Fix:**
```js
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
  cb(null, true);
} else {
  cb(new Error('Only JPEG, PNG, GIF, and WebP are allowed'));
}
```
Additionally, validate file contents using magic bytes (e.g., `file-type` npm package) rather than trusting the client-supplied MIME type.

---

### HIGH-5: CORS Preflight Bypasses Origin Validation

**File:** `index.js:131`

**Explanation:**
A blanket `app.options('*', cors())` handles ALL OPTIONS preflight requests before the route-level CORS middleware runs. This means preflight responses for cross-origin requests from any origin will succeed, potentially allowing the browser to send the actual request.

```js
// index.js:131
app.options('*', cors()); // ← responds to ALL preflights from ANY origin
```

**Why it matters:**
Browsers interpret a successful preflight (200 OK with appropriate headers) as permission to send the full request. Depending on browser behaviour and credential handling, this can enable CSRF-like attacks from unapproved origins.

**Fix:** Remove this line and instead configure the CORS middleware to handle OPTIONS requests directly:
```js
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
```
The `cors` middleware already handles OPTIONS correctly when configured on `app.use()`.

---

### HIGH-6: ZIP Extraction Without Path Traversal Protection (Zip Slip)

**File:** `index.js:3658–3659`

**Explanation:**
`adm-zip`'s `extractAllTo()` has historically been vulnerable to Zip Slip — a vulnerability where a crafted ZIP file contains entries with paths like `../../etc/cron.d/malicious`, causing files to be written outside the intended extraction directory.

```js
// index.js:3658-3659
zip = new AdmZip(req.file.buffer);
zip.extractAllTo(tempDir, true);  // ← no path validation
```

**Why it matters:**
An attacker could upload a ZIP containing a cron job, shell script, or Node.js file that overwrites an existing server file, enabling remote code execution.

**Fix:**
```js
const zipEntries = zip.getEntries();
const resolvedTemp = path.resolve(tempDir);
for (const entry of zipEntries) {
  const entryPath = path.resolve(tempDir, entry.entryName);
  if (!entryPath.startsWith(resolvedTemp + path.sep)) {
    throw new Error(`Zip Slip detected: ${entry.entryName}`);
  }
}
zip.extractAllTo(tempDir, true);
```

---

### HIGH-7: Hardcoded Fallback JWT Secret in Payment Methods Route

**File:** `index.js:6919`

**Explanation:**
The payment methods endpoint independently re-implements JWT verification with a hardcoded fallback secret, bypassing the startup check in `middleware/auth.js`.

```js
// index.js:6919
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
```

If `JWT_SECRET` is not set in the environment, tokens signed with the known default secret will be accepted as valid. The startup guard in `auth.js` only throws in `production` mode; in other environments this default is silently used.

**Fix:** Remove the inline JWT verification entirely. Apply the existing `auth` middleware to this route, then check `req.user` optionally to scope results. Never duplicate secret handling.

---

### HIGH-8: Per-Request `INFORMATION_SCHEMA` Queries — Catastrophic Performance

**File:** `models/user.js:13–20`, `models/user.js:64–72`, and 116 total occurrences across 37 files

**Explanation:**
On every authenticated request, `User.findById()` (called by `auth` middleware) runs two separate queries: one to check if the `cafe_id` column exists in `INFORMATION_SCHEMA`, and one to select the user. At scale, this doubles the DB load for every API call.

```js
// models/user.js:13-20 — executed on EVERY authenticated request
const [columns] = await pool.execute(`
  SELECT COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'cafe_id'
`);
```

With 116 `INFORMATION_SCHEMA` queries across the codebase, many of which fire per-request, this will cause serious performance degradation under load.

**Why it matters:**
`INFORMATION_SCHEMA` queries bypass the query cache, acquire metadata locks, and do full table scans on the `INFORMATION_SCHEMA.COLUMNS` table. On MySQL under load, this can cause database-wide latency spikes.

**Fix:** Use a module-level cached flag, set once at startup:
```js
// Resolved once at application startup
let _hasCafeId = null;
async function hasCafeIdColumn() {
  if (_hasCafeId !== null) return _hasCafeId;
  const [rows] = await pool.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'cafe_id'`
  );
  _hasCafeId = rows.length > 0;
  return _hasCafeId;
}
```
Better yet: run all pending migrations at startup and rely on the schema being known — remove all runtime schema introspection from the hot path.

---

### HIGH-9: `chefAuth` Allows Chefs to Create User Accounts

**File:** `index.js:476, 509`

**Explanation:**
`POST /api/auth/register-chef` and `POST /api/auth/register-reception` both use `chefAuth`, which allows users with the `chef` OR `admin` role. Chefs should not be able to create new user accounts — that is an admin-only operation.

```js
// index.js:476 — chefs can create chefs
app.post('/api/auth/register-chef', chefAuth, ...
// index.js:509 — chefs can create receptionists
app.post('/api/auth/register-reception', chefAuth, ...
```

**Fix:**
```js
app.post('/api/auth/register-chef', auth, requireSuperAdmin, ...
app.post('/api/auth/register-reception', auth, adminAuth, ...
```

---

### HIGH-10: Unauthenticated Routes Leak Business Data

**File:** `index.js:2671–2684`, `index.js:2688–2700`

**Explanation:**
Two unauthenticated endpoints expose internal configuration:

1. `GET /api/server/time` — returns server timezone and UTC timestamp (useful for timing attacks against JWT expiry)
2. `GET /api/cors-test` — returns the full `allowedOrigins` array, listing all production and development URLs

```js
// index.js:2688-2700
app.get('/api/cors-test', (req, res) => {
  res.json({
    allowedOrigins: [...] // ← reveals internal infrastructure
  });
});
```

**Fix:** Remove `/api/cors-test` entirely. Restrict `/api/server/time` to authenticated users. Move CORS debugging to development-only middleware.

---

### HIGH-11: Redundant DB Queries and TOCTOU in Login

**File:** `index.js:2566–2573`

**Explanation:**
The login handler calls `User.findByEmail()` twice: once to check existence, and once to get the password for validation. This introduces a TOCTOU (time-of-check/time-of-use) window where the user record could change between the two reads, and wastes one round-trip per login.

```js
// index.js:2566-2573
const user = await User.findByIdWithCafe((await User.findByEmail(email))?.id);
// ...
const userWithPassword = await User.findByEmail(email); // second identical query
const isValidPassword = await User.validatePassword(userWithPassword, password);
```

**Fix:** Fetch the user once with password included, validate, then fetch with cafe info:
```js
const userWithPassword = await User.findByEmail(email);
if (!userWithPassword || !await User.validatePassword(userWithPassword, password)) {
  return res.status(401).json({ error: 'Invalid email or password' });
}
const user = await User.findByIdWithCafe(userWithPassword.id);
```

---

### HIGH-12: No Security HTTP Headers (Missing Helmet)

**File:** `index.js` (entire file — no helmet usage)

**Explanation:**
The application has no security-related HTTP response headers. Without these headers, browsers provide no protection against:
- Clickjacking (`X-Frame-Options` / `frame-ancestors`)
- XSS reflection (`X-XSS-Protection`)
- MIME-type sniffing (`X-Content-Type-Options`)
- Information leakage (`X-Powered-By: Express` is sent by default)
- Mixed content / protocol downgrade (`Strict-Transport-Security`)

**Fix:**
```bash
npm install helmet
```
```js
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // required for /images/
}));
```

---

# 🟡 Improvements

---

### IMP-1: No Request Body Size Limit on JSON Middleware

**File:** `index.js:153`

`app.use(express.json())` has no `limit` option set. The default is 100kb, which may be insufficient for large payloads but also doesn't protect against JSON-bomb attacks where deeply nested objects cause excessive CPU usage during parsing.

**Fix:**
```js
app.use(express.json({ limit: '1mb' }));
// For specific routes needing large payloads, override per-route
```

---

### IMP-2: Password Minimum Length Is 6 Characters

**File:** `index.js:405`, `index.js:452`, `index.js:485`, `index.js:514`, `index.js:554`, `index.js:692`

Six-character passwords are trivially brute-forced, especially with the current rate limits (see HIGH-2). NIST SP 800-63B recommends a minimum of 8 characters.

**Fix:** Enforce a minimum of 12 characters and check against a common password list:
```js
if (password.length < 12) {
  return res.status(400).json({ error: 'Password must be at least 12 characters' });
}
```

---

### IMP-3: No Token Revocation Mechanism

**File:** `middleware/auth.js` (entirely absent)

There is no logout endpoint and no token denylist. A stolen token cannot be invalidated. When admins are disabled or demoted, their tokens remain valid for up to 24 hours.

**Fix:** Implement a token revocation table or Redis-backed denylist. On logout, store the token's `jti` claim (add one at issue time) in the denylist with its expiry. Check the denylist in `auth` middleware.

---

### IMP-4: Static Images Served Without Authentication or Access Control

**File:** `index.js:156`

```js
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
```

All uploaded images (logos, hero images, menu item photos) are publicly accessible by anyone who knows or guesses the URL. File names are generated with `Date.now()` which are easily brute-forced given a known timestamp window.

**Fix:** Serve images through an authenticated route, or move to a CDN with signed URLs. As a minimum, use UUIDs (already available in the codebase) as the sole component of filenames, removing the predictable timestamp component.

---

### IMP-5: Analytics `days` Parameter Is Unvalidated

**File:** `index.js:2427`

```js
const { days = 30 } = req.query;
startDateObj.setDate(startDateObj.getDate() - parseInt(days));
```

Passing `days=99999999` causes the database to scan years of data, potentially timing out and causing a DoS condition for that cafe's analytics.

**Fix:**
```js
const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
```

---

### IMP-6: `adminAuth` Does Not Recognise Impersonating Super Admins

**File:** `middleware/auth.js:108–118`

When a Super Admin is impersonating a cafe, `req.user.role` remains `'superadmin'`. The `adminAuth` middleware checks `req.user.role !== 'admin'` and blocks them. Impersonating Super Admins must then use their own `/api/superadmin/` routes rather than the cafe admin routes, creating an inconsistent experience and potential gaps in the impersonation.

**Fix:**
```js
const adminAuth = async (req, res, next) => {
  await auth(req, res, () => {
    const effectiveRole = req.user.effective_role || req.user.role;
    if (effectiveRole !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }
    next();
  });
};
```

---

### IMP-7: Backup Endpoint Available to All Cafe Admins

**File:** `index.js:7124`

```js
app.post('/api/backup', auth, adminAuth, async (req, res) => {
```

Any cafe admin can trigger a full database backup. The response includes the `backupPath` — a server filesystem path — leaking internal server structure. Database backups should be automated and restricted to Super Admins or infrastructure operators.

**Fix:**
```js
app.post('/api/backup', auth, requireSuperAdmin, async (req, res) => {
  // ...
  res.json({ success: true, message: 'Backup completed' }); // don't return backupPath
});
```

---

### IMP-8: No Audit Logging for Critical Data Changes

**File:** `services/auditService.js:10–16`

The audit service only covers subscription and feature changes. There is no audit trail for:
- User creation / deletion / role changes
- Customer data modifications
- Order modifications / deletions
- Login events (success and failure)
- Settings changes

**Fix:** Extend `auditService` or add a general-purpose audit log table that captures `user_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `before`, `after`, `timestamp` for all state-changing operations.

---

### IMP-9: `limit` and `offset` Pagination Parameters Are Not Validated for Maximum

**File:** `index.js:1346–1347`, `index.js:1365–1367`, `index.js:1539–1540`

```js
const limit = parseInt(req.query.limit) || 100;
const offset = parseInt(req.query.offset) || 0;
```

Passing `limit=999999` will return the entire audit log table in a single response, potentially causing OOM on the server.

**Fix:**
```js
const limit = Math.min(parseInt(req.query.limit) || 50, 500);
const offset = Math.max(parseInt(req.query.offset) || 0, 0);
```

---

### IMP-10: Inconsistent Logger Usage — 265 `console.*` Calls

**File:** `index.js` (265 occurrences), plus models and services

Winston is correctly configured for structured, rotating log files, but is used in fewer than 20% of log sites. The majority of logging uses `console.error/log/warn`, which bypasses log rotation, structuring, and any log aggregation pipeline.

**Fix:** Require the logger in all files and replace all `console.*` calls:
```js
const logger = require('./config/logger');
// Replace: console.error('Error:', err);
// With:    logger.error('Error:', { error: err.message, stack: err.stack });
```

---

### IMP-11: Login Response Does Not Filter Inactive Users

**File:** `index.js:2567`

The login flow calls `User.findByIdWithCafe()` and `User.findByEmail()` but neither query filters on `is_active`. A soft-deleted user can still log in and receive a new JWT.

**Fix:** Add `AND is_active = 1` to both user lookup queries used in login, and return a specific error:
```js
if (!user.is_active) {
  return res.status(401).json({ error: 'Account is disabled. Please contact support.' });
}
```

---

# 🟢 Enhancements

---

### ENH-1: Monolithic 7,245-Line `index.js`

**File:** `index.js`

The entire application — 100+ routes, middleware, PDF generation, and server bootstrapping — lives in a single file. This makes code review, testing, and onboarding significantly harder.

**Recommended architecture:**
```
src/
  routes/
    auth.routes.js
    menu.routes.js
    orders.routes.js
    invoices.routes.js
    customers.routes.js
    analytics.routes.js
    settings.routes.js
    superadmin.routes.js
  controllers/    (route handler logic)
  middleware/     (existing, good)
  models/         (existing, good)
  services/       (existing, good)
  utils/
    pdf.js        (generatePDF extracted from index.js)
  app.js          (express config, middleware, route registration)
  server.js       (listen, websocket, graceful shutdown)
```

---

### ENH-2: CI/CD Pipeline Has No Tests, Causes Downtime

**File:** `.github/workflows/deploy.yml`

The entire pipeline is:
```yaml
git pull origin master
npm install
pm2 restart cafe-api  # ← causes ~2-5 seconds of downtime
```

Problems:
1. No test step — broken code is deployed immediately
2. `pm2 restart` kills the old process before the new one is ready; use `pm2 reload` for zero-downtime
3. No lockfile (`package-lock.json`) committed; `npm install` can pull different dependency versions each deploy
4. Deploys on `master` push with no staging environment

**Fix:**
```yaml
steps:
  - name: Install dependencies
    run: npm ci  # uses lockfile, reproducible

  - name: Run tests
    run: npm test

  - name: Reload application (zero downtime)
    run: pm2 reload cafe-api
```
Commit `package-lock.json` to the repository.

---

### ENH-3: Graceful Shutdown Does Not Drain Connections

**File:** `index.js:7235–7244`

```js
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0); // ← immediate exit, no drain
});
```

In-flight requests are dropped immediately on SIGTERM. The database connection pool is not closed gracefully.

**Fix:**
```js
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — beginning graceful shutdown');
  server.close(async () => {
    logger.info('HTTP server closed');
    await pool.end();
    logger.info('Database pool closed');
    process.exit(0);
  });
  // Force exit after 30s
  setTimeout(() => { logger.error('Forced exit after timeout'); process.exit(1); }, 30000);
});
```

---

### ENH-4: Health Check Exposes Memory Internals

**File:** `index.js:6882–6905`

```js
memory: process.memoryUsage(), // ← exposes heap usage details publicly
```

The unauthenticated health check endpoint returns detailed memory stats. This helps attackers understand the server's resource headroom and time attacks.

**Fix:** Expose a minimal health check publicly (`{ status: 'ok' }`) and a detailed health check behind authentication for internal monitoring.

---

### ENH-5: No API Versioning

All routes are under `/api/` with no version prefix. Any breaking change requires coordinating all clients simultaneously.

**Fix:** Add version prefix: `/api/v1/`. Maintain a compatibility layer for at least one major version.

---

### ENH-6: No Request Tracing / Correlation IDs

There is no `X-Request-ID` or `X-Correlation-ID` header. It is impossible to correlate a client error with a specific server log entry without parsing timestamps.

**Fix:**
```js
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});
```

---

### ENH-7: Global `wsManager` Antipattern

**File:** `index.js:7205`

```js
global.wsManager = wsManager; // ← pollutes global scope
```

**Fix:** Pass `wsManager` as a dependency to route handlers that need it, or use a module-level singleton:
```js
// websocket.js
let instance = null;
module.exports.getInstance = () => instance;
module.exports.init = (server) => { instance = new WebSocketManager(server); return instance; };
```

---

### ENH-8: Missing Database Indexes

Commonly queried columns lack indexes, leading to full table scans:
- `orders.cafe_id` — filtered on almost every order query
- `orders.status` — filtered for pending/active orders
- `customers.cafe_id` — filtered on every customer query
- `menu_items.cafe_id` — filtered on every menu query
- `users.is_active` — checked on every authentication

**Fix:**
```sql
ALTER TABLE orders ADD INDEX idx_cafe_id (cafe_id);
ALTER TABLE orders ADD INDEX idx_cafe_status (cafe_id, status);
ALTER TABLE customers ADD INDEX idx_cafe_id (cafe_id);
ALTER TABLE menu_items ADD INDEX idx_cafe_id (cafe_id);
ALTER TABLE users ADD INDEX idx_active (is_active);
```

---

### ENH-9: No Test Suite

There are zero unit or integration tests. There is no `test` script in `package.json`.

**Critical test cases to add:**
- Authentication: valid token, expired token, tampered token, disabled user
- Privilege: customer cannot call register-admin, chef cannot create users
- SQL injection: malicious keys in settings update body are rejected
- Input validation: boundary conditions on numeric params
- Tenant isolation: cafe A user cannot read cafe B data
- WebSocket: unauthenticated connection is rejected
- Rate limiting: 11th auth request within window is rejected
- ZIP import: zip slip path traversal is blocked
- Image upload: SVG is rejected

---

### ENH-10: `unhandledRejection` Handler Does Not Exit

**File:** `index.js:7222–7226`

```js
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // "For now, we'll just log it"
});
```

An unhandled rejection means a code path has an uncaught async error. The process is now in an undefined state. The comment acknowledges this but defers action.

**Fix:** Log the error and exit with a non-zero code in production (pm2 will restart):
```js
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', { reason });
  if (process.env.NODE_ENV === 'production') process.exit(1);
});
```

---

## Architecture Recommendation

The current architecture has the right components (models, middleware, services) but the 7,245-line monolith defeats their purpose. The recommended structure for a production-grade Express app serving multiple tenants at scale:

```
┌──────────────────────────────────────────────────────────────┐
│                         Clients                               │
│           Web App / Mobile / POS Terminal                     │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS (TLS terminated at LB/Nginx)
┌────────────────────────▼─────────────────────────────────────┐
│            Reverse Proxy (Nginx / Caddy)                      │
│  • TLS termination  • Rate limiting (fail2ban)                │
│  • Security headers  • Static file serving                    │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│               Express API (pm2 cluster mode)                  │
│  Middleware Stack:                                            │
│    helmet → cors → requestId → rateLimit → morgan → json     │
│  Route Modules:                                              │
│    /v1/auth  /v1/menu  /v1/orders  /v1/superadmin  ...      │
└──────┬─────────────────────┬────────────────────────────────-┘
       │                     │
┌──────▼──────┐    ┌────────▼────────┐    ┌────────────────────┐
│  MySQL      │    │  Redis          │    │  File Storage      │
│  (pool:20)  │    │  • Token deny   │    │  (S3 or local NFS) │
│  • Indexes  │    │  • Rate limit   │    │  • Signed URLs     │
│  • Replicas │    │  • WS sessions  │    │  • No SVG          │
└─────────────┘    └─────────────────┘    └────────────────────┘

Trade-offs:
• Redis adds operational cost but enables stateless token revocation,
  distributed rate limiting, and WebSocket session storage at scale.
• pm2 cluster mode uses all CPU cores — critical for a Node.js single-threaded server.
• Separating file storage from the API server (S3/CDN) removes the path traversal
  risk entirely and enables horizontal scaling without shared filesystem.
```

---

## Issue Summary Table

| ID | Severity | File | Issue |
|---|---|---|---|
| CRIT-1 | 🔴 Critical | index.js:893 | SQL column injection in settings update |
| CRIT-2 | 🔴 Critical | index.js:443 | Any user can create admin accounts |
| CRIT-3 | 🔴 Critical | config/database.js:133 | Hardcoded default admin credentials |
| CRIT-4 | 🔴 Critical | websocket.js:11 | WebSocket has no authentication |
| CRIT-5 | 🔴 Critical | index.js:243 | Path traversal in PDF logo loading |
| HIGH-1 | 🟠 High | middleware/auth.js:20 | 10-minute JWT clock tolerance |
| HIGH-2 | 🟠 High | middleware/rateLimiter.js:25 | Auth rate limit is 5,000/5min |
| HIGH-3 | 🟠 High | models/user.js:76 | Disabled users authenticate successfully |
| HIGH-4 | 🟠 High | index.js:94 | SVG uploads enable stored XSS |
| HIGH-5 | 🟠 High | index.js:131 | CORS preflight bypasses origin validation |
| HIGH-6 | 🟠 High | index.js:3659 | Zip Slip in ZIP extraction |
| HIGH-7 | 🟠 High | index.js:6919 | Hardcoded JWT fallback secret |
| HIGH-8 | 🟠 High | models/user.js:13 | Per-request INFORMATION_SCHEMA queries |
| HIGH-9 | 🟠 High | index.js:476 | Chefs can create user accounts |
| HIGH-10 | 🟠 High | index.js:2688 | Unauthenticated endpoint leaks config |
| HIGH-11 | 🟠 High | index.js:2566 | Redundant DB queries + TOCTOU in login |
| HIGH-12 | 🟠 High | index.js (all) | No security HTTP headers |
| IMP-1 | 🟡 | index.js:153 | No JSON body size limit |
| IMP-2 | 🟡 | index.js:405+ | Min password length is 6 chars |
| IMP-3 | 🟡 | middleware/auth.js | No token revocation mechanism |
| IMP-4 | 🟡 | index.js:156 | Static images served without auth |
| IMP-5 | 🟡 | index.js:2427 | Analytics `days` param unvalidated |
| IMP-6 | 🟡 | middleware/auth.js:111 | adminAuth breaks impersonation |
| IMP-7 | 🟡 | index.js:7124 | Backup accessible to all admins |
| IMP-8 | 🟡 | services/auditService.js | No audit log for user/order changes |
| IMP-9 | 🟡 | index.js:1346 | Pagination limit unvalidated |
| IMP-10 | 🟡 | index.js (all) | 265 console.* bypass Winston |
| IMP-11 | 🟡 | index.js:2567 | Login accepts disabled users |
| ENH-1 | 🟢 | index.js | 7,245-line monolith |
| ENH-2 | 🟢 | deploy.yml | No tests in CI, downtime on deploy |
| ENH-3 | 🟢 | index.js:7235 | Graceful shutdown doesn't drain |
| ENH-4 | 🟢 | index.js:6882 | Health check exposes memory stats |
| ENH-5 | 🟢 | All routes | No API versioning |
| ENH-6 | 🟢 | All routes | No request correlation IDs |
| ENH-7 | 🟢 | index.js:7205 | Global wsManager antipattern |
| ENH-8 | 🟢 | Database | Missing indexes on hot columns |
| ENH-9 | 🟢 | package.json | Zero tests in the codebase |
| ENH-10 | 🟢 | index.js:7222 | unhandledRejection doesn't exit |
