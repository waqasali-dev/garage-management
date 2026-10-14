# Comprehensive Backend Architecture, Security, Sessions, Cookies & Data Normalization Audit

**Target Application:** Precision Garage Management System (Node.js / Express / PostgreSQL Neon / Upstash Redis)  
**Audit Scope:** Entire Backend (`backend/server.js`, `backend/db.js`, `backend/redis.js`, `backend/middleware/*`, `backend/routes/*`, `backend/agent/*`, `backend/schema/*`, `backend/migrate_*.js`, and configuration files)  
**Date of Audit:** October 2026  
**Auditor:** Antigravity Automated Security & Architecture Review System  

---

## Executive Summary

A comprehensive code-level audit was conducted across every component and route of the Precision Garage backend repository. The application features robust operational functionality, including multi-batch FIFO/LIFO inventory valuation, appointment slot conflict checking, automated sequence ID generators, and Redis caching.

However, the audit revealed **critical architectural vulnerabilities** in access control, token handling, session management, and relational data normalization:

1. **Authentication Bypass & Zero Access Control:** Over **85% of API routes** have zero authentication middleware attached. Furthermore, the `authenticateToken` middleware contains an active backdoor/fallback that accepts spoofed HTTP request headers (`X-User-Role: admin`) or JSON body parameters, allowing total superuser privilege escalation without any cryptographic credentials.
2. **CORS Misconfiguration:** The CORS configuration in `server.js` always permits any origin (`callback(null, true)`) while enabling `credentials: true`.
3. **Session & Cookie Deficiencies:** The application lacks HTTP cookies entirely. JWTs are returned in plaintext response bodies, forcing frontends to store them in `localStorage` (susceptible to XSS). There is no refresh token architecture, token revocation, or blacklist mechanism.
4. **Data Normalization & Integrity Risks:** Several tables violate 3rd Normal Form (3NF). Financial totals (`subtotal`, `tax_amount`, `total_cost`) are redundantly stored across multiple tables without database triggers, leading to desynchronization. Dual state machines exist between Work Orders and Appointments. Catalog stock quantities are decoupled from inventory batch counts.

### Severity Breakdown

| Severity | Count | Primary Impact Areas |
| :--- | :---: | :--- |
| 🔴 **Critical** | 4 | Complete Auth Bypass, Unauthenticated Endpoints, Universal CORS Over-Permissiveness, Hardcoded Database Credentials |
| 🟠 **High** | 5 | Hardcoded JWT Secret Fallback, AI SQL Injection/Data Leakage, IDOR across Customer Invoices, Missing Token Revocation, Inventory Batch Desync |
| 🟡 **Medium** | 6 | CSV Formula Injection, Verbose Database Error Leakage, Database MitM (SSL `rejectUnauthorized: false`), Idempotency Collisions, Floating Point Math |
| 🔵 **Low / Info**| 4 | File URL Validation, Health Metric Exposure, Sequence ID Scalability, Unused Migrations |

---

## 1. Security Audit

### 1.1 🔴 Critical Severity Findings

#### SEC-01: Header & Body Spoofing Authentication Bypass (Backdoor)
* **Location:** [`backend/middleware/auth.js`](file:///c:/Codding/garage-management/backend/middleware/auth.js#L46-L61)
* **Mechanics:**
  In `authenticateToken`, when token verification fails or when no token is supplied, the middleware executes:
  ```javascript
  // Fallback: check X-User-Role / X-User-Email / X-Owner-Id headers
  const roleHeader = (req.headers["x-user-role"] || req.body?.user?.role || "").toLowerCase();
  const emailHeader = req.headers["x-user-email"] || req.body?.user?.email;
  const userIdHeader = req.headers["x-user-id"] || req.body?.user?.user_id;
  const ownerIdHeader = req.headers["x-owner-id"] || req.body?.user?.owner_id;

  if (roleHeader) {
      const normalizedRole = roleHeader === "car_owner" || roleHeader === "owner" ? "car_owner" : roleHeader;
      req.user = {
          user_id: userIdHeader || 1,
          email: emailHeader || (roleHeader === "admin" ? "admin@precision.garage" : "owner@precision.garage"),
          role: normalizedRole,
          owner_id: ownerIdHeader || null,
      };
      return next();
  }
  ```
* **Impact:** Any unauthenticated caller can send an HTTP header `x-user-role: admin` or a request body `{ "user": { "role": "admin" } }` to gain full administrator privileges.
* **Remediation:** Remove the entire fallback block. Require valid, cryptographically verified JWT tokens signed by the server's private secret.

---

#### SEC-02: Universal Unauthenticated Route Exposure
* **Location:** All route modules in [`backend/routes/`](file:///c:/Codding/garage-management/backend/routes/)
* **Mechanics:**
  `authenticateToken` is only applied to **7 endpoints** across the entire backend. The following sensitive endpoints have **zero authentication**:
  - `GET /api/users` ([`users.routes.js:L11`](file:///c:/Codding/garage-management/backend/routes/users.routes.js#L11)) – Dumps all user accounts, emails, staff wages/hourly rates, and customer phone numbers.
  - `POST /api/intake` ([`server.js:L117`](file:///c:/Codding/garage-management/backend/server.js#L117)) – Creates work orders, vehicles, and customer records.
  - `DELETE /api/work-orders/:id` ([`workOrders.routes.js:L499`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js#L499)) – Unauthenticated order deletion.
  - `PATCH /api/work-orders/:id/status` ([`workOrders.routes.js:L606`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js#L606)) – Arbitrary order status mutation.
  - `POST /api/inventory` / `PATCH /:id` / `PATCH /:id/restock` / `DELETE /:id` ([`inventory.routes.js`](file:///c:/Codding/garage-management/backend/routes/inventory.routes.js)) – Complete unauthenticated inventory and pricing control.
  - `GET /api/invoices`, `POST /api/invoices/generate`, `PATCH /api/invoices/:id/status` ([`invoices.routes.js`](file:///c:/Codding/garage-management/backend/routes/invoices.routes.js)) – Read/modify billing data and mark invoices as paid.
  - `GET /api/audit-logs`, `POST /api/audit-logs` ([`audit.routes.js`](file:///c:/Codding/garage-management/backend/routes/audit.routes.js)) – Full unauthenticated access to system audit logs and ability to inject fake log entries.
  - `GET /api/vehicles`, `GET /api/vehicles/vin/:vin/history` ([`vehicles.routes.js`](file:///c:/Codding/garage-management/backend/routes/vehicles.routes.js)) – Full public vehicle and customer data dump.
  - `GET /api/staff`, `PUT /api/staff/:id`, `DELETE /api/staff/:id` ([`staff.routes.js`](file:///c:/Codding/garage-management/backend/routes/staff.routes.js)) – Full staff PII, wage edits, and deletions.
  - `GET /api/bays`, `POST /api/bays`, `DELETE /api/bays/:id` ([`bays.routes.js`](file:///c:/Codding/garage-management/backend/routes/bays.routes.js)) – Unrestricted bay modifications.
  - `GET /api/schedules`, `POST /api/schedules`, `DELETE /api/schedules/:id` ([`schedules.routes.js`](file:///c:/Codding/garage-management/backend/routes/schedules.routes.js)) – Unrestricted workshop task scheduling.
  - `GET /api/appointments`, `POST /api/appointments/admin-appoint`, `DELETE /:id` ([`appointments.routes.js`](file:///c:/Codding/garage-management/backend/routes/appointments.routes.js)) – Public calendar tampering.
* **Impact:** Public exposure and total compromise of database records, customer PII, staff wage data, and financial transactions.
* **Remediation:** Apply `authenticateToken` globally or at the top of each router via `router.use(authenticateToken)`. Explicitly mark public routes (e.g., `/api/auth/login`, customer intake if intended for public self-service).

---

#### SEC-03: CORS Configuration Always Allows Any Origin
* **Location:** [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js#L53-L73)
* **Mechanics:**
  ```javascript
  app.use(
      cors({
          origin: (origin, callback) => {
              if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
                  return callback(null, true);
              }
              return callback(null, true); // <--- ALWAYS RETURNS TRUE
          },
          credentials: true,
          ...
      })
  );
  ```
* **Impact:** Regardless of domain, any third-party malicious website running in an administrator or customer browser can perform authenticated cross-origin API calls with credentials enabled.
* **Remediation:** Return `callback(new Error('Not allowed by CORS'))` when origin is not in `allowedOrigins`.

---

#### SEC-04: Production Database Connection String Committed in Environment File
* **Location:** [`backend/.env`](file:///c:/Codding/garage-management/backend/.env#L4)
* **Mechanics:**
  The `DATABASE_URL` contains active cloud PostgreSQL credentials:
  `postgresql://neondb_owner:npg_MnEUA5DI8rGd@ep-square-lab-axos9voe-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require`
* **Impact:** Direct, network-level access to the production PostgreSQL cluster if `.env` is ever committed or exposed.
* **Remediation:** Rotate the database password immediately in the Neon console. Ensure `.env` is listed in all `.gitignore` files and never checked into source control.

---

### 1.2 🟠 High Severity Findings

#### SEC-05: Hardcoded Fallback JWT Secret
* **Location:** [`backend/middleware/auth.js`](file:///c:/Codding/garage-management/backend/middleware/auth.js#L9)
* **Mechanics:**
  `export const JWT_SECRET = process.env.JWT_SECRET || "precision_garage_jwt_secret_key_2026_production";`
* **Impact:** If `JWT_SECRET` is unset or empty in production, the application defaults to a publicly known static string. Attackers can sign arbitrary tokens offline.
* **Remediation:** Throw an explicit error during server startup if `process.env.JWT_SECRET` is not set. Never provide a fallback secret.

---

#### SEC-06: Broken Object Level Authorization (BOLA / IDOR)
* **Location:** 
  - [`backend/routes/invoices.routes.js`](file:///c:/Codding/garage-management/backend/routes/invoices.routes.js#L93) (`GET /api/invoices/:id`)
  - [`backend/routes/vehicles.routes.js`](file:///c:/Codding/garage-management/backend/routes/vehicles.routes.js#L187) (`GET /api/vehicles/vin/:vin/history`)
  - [`backend/routes/workOrders.routes.js`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js#L329) (`GET /api/work-orders/:id`)
* **Mechanics:** Endpoints accept arbitrary identifiers (`:id`, `:vin`) and return full customer records without verifying if the authenticated user (`req.user.owner_id`) matches the owner of the requested record.
* **Impact:** Any authenticated customer can view every other customer's repair history, invoices, line items, and inspection media.
* **Remediation:** Validate that `req.user.role === 'admin'` OR `record.owner_id === req.user.owner_id`.

---

#### SEC-07: SQL Injection & Tenant Isolation Bypass in AI Agent
* **Location:** [`backend/agent/agent.js`](file:///c:/Codding/garage-management/backend/agent/agent.js#L183-L197)
* **Mechanics:**
  In `executeSafeSqlQuery`, customer query isolation is checked as follows:
  ```javascript
  const isQueryingPersonalData = /\b(vehicles|work_order_data|invoice_data|scheduled_tasks|car_owners)\b/i.test(trimmed);
  if (isQueryingPersonalData) {
      const containsOwnerRef = trimmed.includes(constantOwnerId) || (params && params.includes(constantOwnerId));
      if (!containsOwnerRef) {
          return { error: `SECURITY BLOCK...` };
      }
  }
  ```
  1. A simple SQL comment containing `constantOwnerId` (e.g. `SELECT * FROM car_owners -- OWN-0001`) satisfies `trimmed.includes(constantOwnerId)`.
  2. Critical tables storing personal customer data—such as `appointments`, `audit_logs`, `work_order_items`, and `work_order_media`—are **omitted** from `isQueryingPersonalData`.
* **Impact:** A malicious prompt can bypass tenant isolation and query other customers' appointments, inspection media, and logs.
* **Remediation:** Use parameterized database views or Postgres Row-Level Security (RLS) (`SET LOCAL app.current_owner_id = ...`) instead of naive string matching.

---

#### SEC-08: Unrestricted Arbitrary Media Upload URLs (SSRF / Stored XSS)
* **Location:** [`backend/routes/workOrders.routes.js`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js#L978-L1006)
* **Mechanics:**
  `POST /api/work-orders/:id/media` accepts any string as `file_url`:
  ```javascript
  const { file_url, file_type = "vehicle_condition" } = req.body;
  await pool.query(query, [id, file_url.trim(), sanitizedType]);
  ```
* **Impact:** Attackers can insert `javascript:...` payloads (Stored XSS when rendered in client anchor/iframe tags) or internal URLs (SSRF if fetched by server-side workers).
* **Remediation:** Enforce strict URL parsing (`http:`, `https:`) and validate domains against a configured CDN/S3 bucket whitelist.

---

#### SEC-09: Inventory Batch Stock vs. Total Stock Desynchronization
* **Location:** 
  - [`backend/routes/inventory.routes.js`](file:///c:/Codding/garage-management/backend/routes/inventory.routes.js#L560-L586) (`PATCH /api/inventory/:id`)
  - [`backend/routes/workOrders.routes.js`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js#L815-L836) (`POST /api/work-orders/:id/items`)
* **Mechanics:**
  `inventory_data.stock_quantity` can be updated directly via `PATCH /api/inventory/:id` without updating `inventory_batches.quantity_remaining`. When work orders allocate parts, they decrement batch stock; when manual stock adjustments occur, batch stock remains unchanged, causing FIFO/LIFO calculations to use stale or negative inventory counts.
* **Impact:** Inaccurate financial valuation, stock discrepancies, and inventory corruption.
* **Remediation:** Make `inventory_batches` the single source of truth for stock quantities, with `inventory_data.stock_quantity` generated as a view or synchronized via strict database triggers.

---

### 1.3 🟡 Medium Severity Findings

#### SEC-10: CSV Formula Injection (Excel Macro / DDE Execution)
* **Location:** [`backend/routes/export.routes.js`](file:///c:/Codding/garage-management/backend/routes/export.routes.js#L23-L33), [L59-L69](file:///c:/Codding/garage-management/backend/routes/export.routes.js#L59-L69)
* **Mechanics:**
  Strings from the database (`part_name`, `sku`, `owner_name`, `model`) are concatenated into CSV output without sanitization:
  ```javascript
  csv += `"${r.sku}","${r.part_name}","${r.category}",...`;
  ```
* **Impact:** If an attacker enters an owner name or part starting with `=`, `+`, `-`, `@`, or tab characters, opening the downloaded CSV in Microsoft Excel or LibreOffice can trigger formula execution or command execution.
* **Remediation:** Prepend a single quote (`'`) to any cell whose first character is `=`, `+`, `-`, `@`, `\t`, or `\r`. Escape embedded double quotes (`""`).

---

#### SEC-11: Internal Database Error & Stack Trace Information Leakage
* **Location:** 
  - [`backend/middleware/errorHandler.js`](file:///c:/Codding/garage-management/backend/middleware/errorHandler.js#L25-L28)
  - Almost all routes returning `details: err.message`
* **Mechanics:**
  Database error details (`err.detail`, `err.message`, SQL column names, table names, constraint violations) are serialized into client response JSON.
* **Impact:** Reveals internal database schema, table structures, and software versions to attackers.
* **Remediation:** In production, return generic user-friendly error messages. Log detailed error stacks only to server logs.

---

#### SEC-12: Database Connection Disables SSL Certificate Verification (MitM)
* **Location:** [`backend/db.js`](file:///c:/Codding/garage-management/backend/db.js#L17-L19), [`backend/migrate_neon.js`](file:///c:/Codding/garage-management/backend/migrate_neon.js#L20-L22)
* **Mechanics:**
  ```javascript
  ssl: {
      rejectUnauthorized: false,
  }
  ```
* **Impact:** The application accepts self-signed or invalid TLS certificates from the PostgreSQL server, leaving traffic vulnerable to Man-in-the-Middle (MitM) eavesdropping.
* **Remediation:** Use CA certificates provided by the database host and set `rejectUnauthorized: true`.

---

#### SEC-13: Absence of Rate Limiting & Brute-Force Protection
* **Location:** [`backend/routes/auth.routes.js`](file:///c:/Codding/garage-management/backend/routes/auth.routes.js#L10)
* **Mechanics:** There is no rate limiter (e.g. `express-rate-limit`) on `/api/auth/login` or `/api/auth/change-password`.
* **Impact:** Attackers can perform high-speed credential stuffing and password guessing attacks.
* **Remediation:** Implement IP- and account-based rate limiting on all authentication routes.

---

#### SEC-14: Account Deactivation Enumeration Oracle
* **Location:** [`backend/routes/auth.routes.js`](file:///c:/Codding/garage-management/backend/routes/auth.routes.js#L22-L30)
* **Mechanics:**
  ```javascript
  if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials." });
  if (!user.is_active) return res.status(403).json({ error: "This account has been deactivated/suspended." });
  ```
* **Impact:** An attacker can enumerate whether an email exists in the system by observing whether the API responds with "This account has been deactivated/suspended" vs "Invalid credentials".
* **Remediation:** Return a generic "Invalid email or password" error for both non-existent and deactivated accounts.

---

#### SEC-15: Floating-Point Math for Financial Calculations
* **Location:**
  - [`backend/routes/invoices.routes.js`](file:///c:/Codding/garage-management/backend/routes/invoices.routes.js#L242)
  - [`backend/routes/vehicles.routes.js`](file:///c:/Codding/garage-management/backend/routes/vehicles.routes.js#L78)
* **Mechanics:**
  Calculations such as `subtotal * (effectiveTaxPercentage / 100.0)` and `w.total_cost * 1.05` use native JavaScript IEEE 754 floating-point arithmetic.
* **Impact:** Cumulative rounding inaccuracies can create discrepancy between invoices and ledgers.
* **Remediation:** Perform financial calculations directly in PostgreSQL using `NUMERIC` data types, or calculate integer amounts in cents (smallest currency unit).

---

## 2. Sessions & Cookies Audit

### 2.1 Complete Absence of HTTP Cookies [RESOLVED ✅]
* **Inspection Result (Historical):**
  - `cookie-parser` was previously missing from [`backend/package.json`](file:///c:/Codding/garage-management/backend/package.json).
  - No route set or read cookies; JWT was stored exclusively in `localStorage`.
* **Resolution Implemented:**
  - Installed `cookie-parser` and registered it globally in [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js).
  - Created [`backend/middleware/cookies.js`](file:///c:/Codding/garage-management/backend/middleware/cookies.js) providing centralized `setAuthCookie()`, `clearAuthCookie()`, and `extractToken()` helper functions with `HttpOnly`, `SameSite`, and environment-adaptive `Secure` flags.
  - Updated [`backend/routes/auth.routes.js`](file:///c:/Codding/garage-management/backend/routes/auth.routes.js) to issue cookies upon login and clear them upon logout (`POST /api/auth/logout`), while maintaining dual backwards compatibility for `Authorization: Bearer` headers.
  - Implemented session verification endpoint `GET /api/auth/me`.
  - Updated frontend [`frontend/src/config/api.js`](file:///c:/Codding/garage-management/frontend/src/config/api.js) and [`frontend/src/context/AuthContext.js`](file:///c:/Codding/garage-management/frontend/src/context/AuthContext.js) to send `credentials: 'include'` and verify the session automatically on application mount.

### 2.2 Token Lifetime & Lack of Revocation (Stateless Drift) [RESOLVED ✅]
* **Inspection Result (Historical):**
  - Tokens were valid for 7 days without verifying user active status in the database.
* **Resolution Implemented:**
  - Updated `authenticateToken` in [`backend/middleware/auth.js`](file:///c:/Codding/garage-management/backend/middleware/auth.js) to query `users.is_active` in real time with high-performance 60-second Redis/in-memory caching.
  - Deactivated or suspended accounts are instantly rejected with `AUTH_ACCOUNT_DEACTIVATED`.
  - Integrated immediate cache invalidation (`deleteCache("garage:user_active:<userId>")`) across user status updates and soft deactivations in [`backend/routes/users.routes.js`](file:///c:/Codding/garage-management/backend/routes/users.routes.js).

### 2.3 Idempotency Session Collision & Cross-Talk Risk [RESOLVED ✅]
* **Location:** [`backend/middleware/idempotency.js`](file:///c:/Codding/garage-management/backend/middleware/idempotency.js)
* **Mechanics (Historical):**
  - Unauthenticated NAT/proxy IPs could experience cross-talk replay collision if identical requests were dispatched.
* **Resolution Implemented:**
  - Bound user authentication tokens and identities directly into the idempotency signature (`user:<hash>` vs `ip:<ip>`).
  - Restricted automated response replay caching strictly to authenticated requests or explicit client-supplied `X-Idempotency-Key` headers, eliminating cross-talk data leakage behind shared corporate proxies.

---

## 3. Data Normalization & Database Architecture Audit

### 3.1 Normalization Analysis (1NF, 2NF, 3NF)

```mermaid
erDiagram
    CAR_OWNERS ||--o{ VEHICLES : owns
    CAR_OWNERS ||--o| USERS : portal_account
    STAFF_DATA ||--o| USERS : staff_account
    VEHICLES ||--o{ WORK_ORDER_DATA : services
    WORK_ORDER_DATA ||--o{ WORK_ORDER_ITEMS : contains
    WORK_ORDER_ITEMS ||--o| INVENTORY_DATA : uses
    INVENTORY_DATA ||--o{ INVENTORY_BATCHES : restocks
    WORK_ORDER_DATA ||--o| INVOICE_DATA : bills
    CAR_OWNERS ||--o{ INVOICE_DATA : billed_to
```

#### Issue 1: Third Normal Form (3NF) Violation in Financial Totals (Transitive Dependency)
* **Tables:** `work_order_data`, `work_order_items`, `invoice_data`
* **Details:**
  - `work_order_items.total_price` is a generated column (`quantity_or_hours * unit_price`).
  - `work_order_data.total_cost` is a stored column that duplicates the sum of `work_order_items.total_price`.
  - `invoice_data.subtotal` duplicates `work_order_data.total_cost`.
  - `invoice_data.total_amount` is a generated column (`subtotal + tax_amount`).
* **Problem:** If a line item is inserted or deleted outside the standard route handler (e.g. via direct database query, batch import, or migration), `work_order_data.total_cost` and `invoice_data.subtotal` become out of sync.
* **Remediation:** Use PostgreSQL database triggers (`AFTER INSERT OR UPDATE OR DELETE ON work_order_items`) or database views to compute work order totals dynamically.

#### Issue 2: Entity Duplication across `users` and `staff_data`
* **Tables:** `users`, `staff_data`
* **Details:**
  - `staff_data` contains: `email`, `role`, `is_active`, `full_name`.
  - `users` contains: `email`, `role`, `is_active`, `staff_id`.
* **Problem:** An employee's email or active status must be updated in two separate tables. In several routes (e.g., [`users.routes.js:L384`](file:///c:/Codding/garage-management/backend/routes/users.routes.js#L384)), updating `users.is_active` requires a separate `UPDATE staff_data`. If one fails, user state is inconsistent.
* **Remediation:** Establish `users` as the single authority for authentication credentials (`email`, `password_hash`, `is_active`), while `staff_data` holds profile information (`hourly_rate`, `address`, `phone`).

#### Issue 3: Redundant VAT Number Storage
* **Tables:** `car_owners`, `invoice_data`
* **Details:**
  `vat_number` is stored on `car_owners` AND `customer_vat` is stored on `invoice_data`. When an invoice is updated, custom logic conditionally back-syncs to `car_owners`.
* **Remediation:** Invoices should snapshot the customer's VAT number only at the time of invoice issuance for historical tax compliance, with clear immutable rules once issued.

#### Issue 4: Dual Status Tracking / Conflicting State Machines
* **Tables:** `work_order_data`, `appointments`
* **Details:**
  - `work_order_data.status` has ENUM values: `'received'`, `'scheduled'`, `'diagnosed'`, `'approved'`, `'in_progress'`, `'quality_check'`, `'ready'`, `'completed'`, `'cancelled'`.
  - `appointments.status` has VARCHAR check constraints: `'confirmed'`, `'in_bay'`, `'completed'`, `'cancelled'`, `'no_show'`.
* **Problem:** When an appointment status changes to `'in_bay'`, `work_order_data.status` might still be `'scheduled'` or `'received'`. Two competing status fields for the same vehicle visit create operational confusion.
* **Remediation:** Clearly delineate appointment status (calendar slot state) from work order status (repair workflow state), or link them via transactional triggers.

#### Issue 5: Primary Key Format Inconsistencies
* **Details:**
  - `car_owners`: Formatted String `VARCHAR(30)` (`OWN-0001`) via sequence function.
  - `vehicles`: Formatted String `VARCHAR(30)` (`VEH-0001`).
  - `work_order_data`: Formatted String `VARCHAR(30)` (`WO-2026-0001`).
  - `invoice_data`: Formatted String `VARCHAR(30)` (`INV-2026-0001`).
  - `staff_data`, `users`, `inventory_data`, `work_order_items`, `audit_logs`: Integer `SERIAL PRIMARY KEY`.
* **Problem:** String-based IDs increase index size and foreign key overhead, and string formatting prevents natural numeric sorting.
* **Remediation:** Standardize on numeric `BIGSERIAL` / `INT` or standard `UUIDv4` for internal primary keys and foreign keys. Use formatted IDs (`WO-2026-0001`) strictly as user-facing display codes.

---

## 4. File-by-File Line-Level Audit Matrix

| File Path | Lines | Category | Finding / Vulnerability | Remediation |
| :--- | :--- | :--- | :--- | :--- |
| [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js) | 55–60 | Security | CORS origin callback unconditionally returns `true` | Return error if origin not in `allowedOrigins` |
| [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js) | 67–71 | Security | Allowed headers whitelist client role/identity spoofing | Remove spoofed client headers |
| [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js) | 75–76 | Performance | Request body limit set to `50mb` without validation | Lower limit to `2mb` for standard JSON endpoints |
| [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js) | 84–108 | Security | Health check endpoint exposes server time and PG version | Restrict telemetry or hide version string |
| [`backend/db.js`](file:///c:/Codding/garage-management/backend/db.js) | 18 | Security | `rejectUnauthorized: false` allows MitM attacks | Supply trusted CA bundle and enable verification |
| [`backend/redis.js`](file:///c:/Codding/garage-management/backend/redis.js) | 45–65 | Architecture | In-memory cache fallback lacks TTL eviction thread | Use periodic cleanup or LRU cache eviction |
| [`backend/middleware/auth.js`](file:///c:/Codding/garage-management/backend/middleware/auth.js) | 9 | Security | Hardcoded fallback JWT secret string | Require `JWT_SECRET` in `.env`, exit if missing |
| [`backend/middleware/auth.js`](file:///c:/Codding/garage-management/backend/middleware/auth.js) | 46–61 | Security | Header & body fallback allows total auth bypass | Remove header/body auth bypass completely |
| [`backend/middleware/auth.js`](file:///c:/Codding/garage-management/backend/middleware/auth.js) | 81–84 | Security | Role check grants admin universal bypass without DB check | Validate active status in database |
| [`backend/middleware/errorHandler.js`](file:///c:/Codding/garage-management/backend/middleware/errorHandler.js) | 27 | Info Leak | Stack trace returned when `NODE_ENV !== "production"` | Never send stack traces in API responses |
| [`backend/middleware/idempotency.js`](file:///c:/Codding/garage-management/backend/middleware/idempotency.js) | 31–36 | Security | IP-based hashing leads to NAT collisions and response leakage | Include `req.user.user_id` in hash |
| [`backend/routes/auth.routes.js`](file:///c:/Codding/garage-management/backend/routes/auth.routes.js) | 10–35 | Security | No rate limiting on login endpoint | Add `express-rate-limit` |
| [`backend/routes/auth.routes.js`](file:///c:/Codding/garage-management/backend/routes/auth.routes.js) | 29 | Info Leak | Distinguishes inactive account from invalid credentials | Return uniform error message |
| [`backend/routes/auth.routes.js`](file:///c:/Codding/garage-management/backend/routes/auth.routes.js) | 95–97 | Security | Minimum password length is only 6 characters | Enforce 8+ characters and complexity |
| [`backend/routes/users.routes.js`](file:///c:/Codding/garage-management/backend/routes/users.routes.js) | 11–76 | Security | `GET /api/users` has NO authentication; leaks PII and wages | Add `authenticateToken` and `requireRole(['admin'])` |
| [`backend/routes/users.routes.js`](file:///c:/Codding/garage-management/backend/routes/users.routes.js) | 104–108 | Security | `handleCreateUser` checks `x-user-role` header for admin | Remove header check, enforce JWT auth |
| [`backend/routes/workOrders.routes.js`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js) | 10–252 | Security | `handleIntake` is unauthenticated | Add authentication or CAPTCHA protection |
| [`backend/routes/workOrders.routes.js`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js) | 257–603 | Security | Work orders listing, details, notes, deletion unauthenticated | Enforce `authenticateToken` |
| [`backend/routes/workOrders.routes.js`](file:///c:/Codding/garage-management/backend/routes/workOrders.routes.js) | 978–1006| Security | `POST /:id/media` accepts arbitrary URLs | Validate protocol and CDN hostname |
| [`backend/routes/inventory.routes.js`](file:///c:/Codding/garage-management/backend/routes/inventory.routes.js) | 8–197 | Security | Inventory listing with cost prices is unauthenticated | Restrict cost prices to authorized staff |
| [`backend/routes/inventory.routes.js`](file:///c:/Codding/garage-management/backend/routes/inventory.routes.js) | 385–520| Security | Adding, updating, restocking parts is unauthenticated | Enforce `requireRole(['admin', 'staff'])` |
| [`backend/routes/invoices.routes.js`](file:///c:/Codding/garage-management/backend/routes/invoices.routes.js) | 8–90 | Security | Customer invoices list has no authentication | Add `authenticateToken` and owner scope filter |
| [`backend/routes/invoices.routes.js`](file:///c:/Codding/garage-management/backend/routes/invoices.routes.js) | 310–349| Security | Updating invoice status to 'paid' is unauthenticated | Restrict to Admin |
| [`backend/routes/appointments.routes.js`](file:///c:/Codding/garage-management/backend/routes/appointments.routes.js)| 66–144 | Security | Appointments list has no authentication | Enforce `authenticateToken` |
| [`backend/routes/appointments.routes.js`](file:///c:/Codding/garage-management/backend/routes/appointments.routes.js)| 229–350| Security | `admin-appoint` has no authentication check | Enforce `requireRole(['admin'])` |
| [`backend/routes/bays.routes.js`](file:///c:/Codding/garage-management/backend/routes/bays.routes.js) | 30–256 | Security | Workshop bay management has no authentication | Enforce `authenticateToken` |
| [`backend/routes/staff.routes.js`](file:///c:/Codding/garage-management/backend/routes/staff.routes.js) | 8–530 | Security | Staff directory and hourly rate edits unauthenticated | Enforce `requireRole(['admin'])` |
| [`backend/routes/owners.routes.js`](file:///c:/Codding/garage-management/backend/routes/owners.routes.js) | 8–114 | Security | Car owners directory and PII unauthenticated | Enforce `authenticateToken` |
| [`backend/routes/vehicles.routes.js`](file:///c:/Codding/garage-management/backend/routes/vehicles.routes.js) | 8–184 | Security | Vehicle directory and VIN lookup unauthenticated | Enforce `authenticateToken` |
| [`backend/routes/schedules.routes.js`](file:///c:/Codding/garage-management/backend/routes/schedules.routes.js) | 8–320 | Security | Task scheduling and deletion unauthenticated | Enforce `authenticateToken` |
| [`backend/routes/settings.routes.js`](file:///c:/Codding/garage-management/backend/routes/settings.routes.js) | 67 | Security | Settings PUT relies on bypassable auth middleware | Patch `authenticateToken` |
| [`backend/routes/audit.routes.js`](file:///c:/Codding/garage-management/backend/routes/audit.routes.js) | 8–244 | Security | Audit log reading and event creation unauthenticated | Restrict reading to Admin |
| [`backend/routes/export.routes.js`](file:///c:/Codding/garage-management/backend/routes/export.routes.js) | 23–69 | Security | CSV export has no auth and allows Formula Injection | Add auth and escape formula characters |
| [`backend/routes/ai.routes.js`](file:///c:/Codding/garage-management/backend/routes/ai.routes.js) | 80–113 | Security | Owner ID resolution fallback via email header | Resolve owner ID strictly from verified token |
| [`backend/agent/agent.js`](file:///c:/Codding/garage-management/backend/agent/agent.js) | 188–196| Security | Naive string matching for owner SQL query isolation | Use AST validation or Postgres RLS |
| [`backend/.env`](file:///c:/Codding/garage-management/backend/.env) | 4 | Security | Cloud database credentials committed in `.env` | Rotate password and remove from git history |

---

## 5. Prioritized Remediation Roadmap

### Phase 1: Critical Emergency Patches (Immediate)
1. **Remove Authentication Bypass:** Delete lines 46–61 in [`backend/middleware/auth.js`](file:///c:/Codding/garage-management/backend/middleware/auth.js).
2. **Fix CORS:** Change line 59 in [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js) to reject unapproved origins.
3. **Mount Authentication Globally:** Apply `authenticateToken` across all route modules in [`backend/server.js`](file:///c:/Codding/garage-management/backend/server.js), whitelisting only public login and health check routes.
4. **Rotate Secrets:** Rotate the Neon PostgreSQL database password and generate a cryptographically strong 256-bit random string for `JWT_SECRET`. Remove default secret fallback.

### Phase 2: Session & Access Control Hardening (Days 2–4)
1. **Adopt Secure HTTP-Only Cookies:**
   - Install `cookie-parser`.
   - Issue tokens via `res.cookie('token', jwt, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: ... })`.
2. **Implement Dual-Token Architecture:**
   - Issue short-lived access tokens (15 minutes).
   - Issue long-lived refresh tokens stored securely with rotation.
3. **Add Rate Limiting:**
   - Install `express-rate-limit`. Apply limits to `/api/auth/login`, `/api/auth/change-password`, and `/api/ai/chat`.
4. **Enforce Tenant Scoping (IDOR Prevention):**
   - Verify that non-admin users can only view and modify records matching their `owner_id` or `staff_id`.
5. **Sanitize CSV Exports:**
   - Prepend `'` to formula triggers (`=`, `+`, `-`, `@`) and escape double quotes in [`backend/routes/export.routes.js`](file:///c:/Codding/garage-management/backend/routes/export.routes.js).

### Phase 3: Data Normalization & Database Refactoring (Days 5–7)
1. **Sync Inventory Batches with Catalog:**
   - Create a database trigger to update `inventory_data.stock_quantity` whenever an insert or update occurs on `inventory_batches`.
2. **Automate Financial Synchronization:**
   - Implement PostgreSQL triggers on `work_order_items` to automatically update `work_order_data.total_cost` and open `invoice_data.subtotal`.
3. **Unify Status State Machines:**
   - Harmonize `work_order_data.status` and `appointments.status` to prevent desynchronized scheduling states.
4. **Migrate String IDs to BigInt / UUID:**
   - Plan a staged migration to use standard numeric primary keys for internal relational consistency.
