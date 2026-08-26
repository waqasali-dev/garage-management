# 🔍 Precision Garage — Full Repository Audit Report

> **Scope**: Backend ([server.js](file:///d:/codding/App/garage_management/backend/server.js), [db.js](file:///d:/codding/App/garage_management/backend/db.js), [redis.js](file:///d:/codding/App/garage_management/backend/redis.js)) + Frontend (React 19 — all components, context, config, CSS)
> **Date**: Aug 26, 2026

---

## Table of Contents

1. [🚨 Critical Security Issues](#1--critical-security-issues)
2. [🏗️ Architecture & Structural Problems](#2--architecture--structural-problems)
3. [⚡ Performance & Optimization Gaps](#3--performance--optimization-gaps)
4. [🐛 Bugs & Unhandled Edge Cases](#4--bugs--unhandled-edge-cases)
5. [🧩 Missing Features & Business Logic Gaps](#5--missing-features--business-logic-gaps)
6. [🎨 Frontend-Specific Issues](#6--frontend-specific-issues)
7. [📦 DevOps, Deployment & Repo Hygiene](#7--devops-deployment--repo-hygiene)
8. [📊 Summary Scorecard](#8--summary-scorecard)

---

## 1. 🚨 Critical Security Issues

### 1.1 — SQL Injection in Audit Logs Endpoint

**Severity: 🔴 CRITICAL**

In [server.js L2327-2328](file:///d:/codding/App/garage_management/backend/server.js#L2327-L2328), the `event_type` query parameter is directly interpolated into SQL using a template literal:

```js
typeCondition = `a.event_type ILIKE '%${event_type}%'`;
```

This is a **textbook SQL injection vulnerability**. An attacker can send:
```
GET /api/audit-logs?event_type='; DROP TABLE users; --
```

> [!CAUTION]
> This is exploitable right now in production. Fix immediately by using parameterized queries (`$1`, `$2` etc.) like you do everywhere else.

---

### 1.2 — No Authentication/Authorization on ANY API Route

**Severity: 🔴 CRITICAL**

The backend has **zero authentication middleware**. Every single endpoint — including destructive ones — is publicly accessible to anyone who knows the URL:

| What's exposed | Impact |
|---|---|
| `DELETE /api/work-orders/:id` | Anyone can delete work orders |
| `POST /api/admin/create-user` | Anyone can create admin accounts |
| `DELETE /api/users/:id` | Anyone can disable accounts |
| `PATCH /api/staff/work-orders/:id/status` | Anyone can modify work orders |
| `POST /api/inventory` | Anyone can add/delete inventory |
| `GET /api/users` | Leaks all user data including hashed passwords |

The frontend has `ProtectedRoute` but that's **client-side only** — it provides zero protection. All APIs are wide open.

**Missing:**
- No JWT / session tokens
- No `Authorization` header validation
- No role-based middleware (`requireAdmin`, `requireStaff`)
- No API key protection

---

### 1.3 — Database Credentials Committed to Git

**Severity: 🔴 CRITICAL**

The [backend/.env](file:///d:/codding/App/garage_management/backend/.env) file contains live production credentials:

```
DATABASE_URL=postgresql://neondb_owner:npg_MnEUA5DI8rGd@...
UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAZXuAAIgcDJjMzZl...
```

Even though `.gitignore` lists `.env` files, the `.env` files **are currently in the repo** (I can read them). This means the credentials are in git history. Anyone who clones your repo has full access to your production database and Redis cache.

> [!WARNING]
> Rotate these credentials immediately. Even after adding `.env` to `.gitignore`, the old values remain in git history. Use `git filter-branch` or BFG Repo-Cleaner to purge them.

---

### 1.4 — Passwords Returned in API Responses

[server.js L3039-3042](file:///d:/codding/App/garage_management/backend/server.js#L3039-L3042): The login query uses `SELECT *` which returns the `password` hash to the login handler. While the final response uses `detailsResult`, the initial `result.rows[0]` contains the hash in memory.

More critically, `GET /api/users` at [L2639-2662](file:///d:/codding/App/garage_management/backend/server.js#L2639-L2662) returns full user records with `...row` spread — this **likely includes the password hash** in the response payload.

---

### 1.5 — CORS is Wide Open

```js
app.use(cors());  // Line 26
```

This allows **any origin** to make requests to your API. In production, this should be restricted to your frontend domain only.

---

## 2. 🏗️ Architecture & Structural Problems

### 2.1 — God File: 3,400-Line Monolith Server

[server.js](file:///d:/codding/App/garage_management/backend/server.js) is **130KB / 3,401 lines** containing everything: routes, controllers, business logic, data formatting, and audit logging — all in a single file.

**Should be split into:**

```
backend/
├── routes/
│   ├── inventory.routes.js
│   ├── workOrders.routes.js
│   ├── staff.routes.js
│   ├── owners.routes.js
│   ├── auth.routes.js
│   ├── invoices.routes.js
│   ├── schedules.routes.js
│   └── audit.routes.js
├── middleware/
│   ├── auth.js
│   ├── idempotency.js
│   └── errorHandler.js
├── services/
│   ├── inventoryService.js
│   └── workOrderService.js
├── db.js
├── redis.js
└── server.js (just app setup + route mounting)
```

---

### 2.2 — No Error Handling Middleware

Every route has its own `try/catch` with duplicated error response formatting. There's no global Express error handler:

```js
// Missing:
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message });
});
```

---

### 2.3 — Duplicated Route Handlers

The same handler is mounted on multiple paths with no abstraction:

```js
app.get("/api/staff/work-orders", handleGetWorkOrdersList);     // L880
app.get("/api/work-orders", handleGetWorkOrdersList);            // L881

app.get("/api/staff/work-orders/:id", handleGetSingleWorkOrder); // L999
app.get("/api/work-orders/:id", handleGetSingleWorkOrder);       // L1000
```

This should be a single route with role-based middleware, or use Express Router mounting.

---

### 2.4 — Frontend: Massive Monolith Components

Several components are excessively large with deeply tangled state:

| Component | Lines | Size |
|---|---|---|
| [WorkOrderExecution.jsx](file:///d:/codding/App/garage_management/frontend/src/staff/WorkOrderExecution.jsx) | 1,549 | 86 KB |
| [WorkOrderDetails.jsx](file:///d:/codding/App/garage_management/frontend/src/components/WorkOrderDetails.jsx) | 1,460 | 81 KB |
| [UserManagement.jsx](file:///d:/codding/App/garage_management/frontend/src/components/UserManagement.jsx) | 1,152 | 66 KB |
| [Inventory.jsx](file:///d:/codding/App/garage_management/frontend/src/components/Inventory.jsx) | 1,032 | 53 KB |
| [Scheduling.jsx](file:///d:/codding/App/garage_management/frontend/src/components/Scheduling.jsx) | — | 43 KB |

These need to be decomposed into smaller components (modal components, form components, list components, etc.).

---

### 2.5 — `database.db` File in Frontend Directory

There's a [database.db](file:///d:/codding/App/garage_management/frontend/database.db) (11 KB) sitting in the **frontend directory**. The migration script reads it from there. This is a schema definition file masquerading with a confusing name — it should be in `backend/schema/` and named `schema.sql`.

---

## 3. ⚡ Performance & Optimization Gaps

### 3.1 — N+1 Query Problem: Vehicle History

In [server.js L1997-2047](file:///d:/codding/App/garage_management/backend/server.js#L1997-L2047), the VIN history endpoint runs **3 separate queries per work order** inside a `Promise.all(workOrders.map(...))`:

```js
const enhancedWorkOrders = await Promise.all(
    workOrders.map(async (wo) => {
        const itemsRes = await pool.query(...)    // Query 1 per WO
        const mediaRes = await pool.query(...)    // Query 2 per WO
        const tasksRes = await pool.query(...)    // Query 3 per WO
    })
);
```

If a vehicle has 20 work orders, that's **60+ database queries** for a single API call. This should be rewritten using JOINs or batch queries with `WHERE work_order_id = ANY($1)`.

---

### 3.2 — Correlated Subqueries in List Endpoints

The owners list ([L1625-1667](file:///d:/codding/App/garage_management/backend/server.js#L1625-L1667)) has **5 correlated subqueries per row**:
- `vehicles_count`
- `primary_vehicle`
- `primary_vin`
- `active_orders_count`
- `lifetime_spent`

The staff list ([L1422-1451](file:///d:/codding/App/garage_management/backend/server.js#L1422-L1451)) has **2 correlated subqueries per row**.

The work orders list ([L823-868](file:///d:/codding/App/garage_management/backend/server.js#L823-L868)) has **2 correlated subqueries** (`items_count`, `media_count`).

These degrade as data grows. Replace with `LEFT JOIN` + `GROUP BY` or window functions.

---

### 3.3 — UPPER(TRIM()) on Every WHERE Clause

Multiple queries use `WHERE UPPER(TRIM(w.work_order_id)) = UPPER(TRIM($1))` ([L909](file:///d:/codding/App/garage_management/backend/server.js#L909), [L929](file:///d:/codding/App/garage_management/backend/server.js#L929), [L936](file:///d:/codding/App/garage_management/backend/server.js#L936), [L951](file:///d:/codding/App/garage_management/backend/server.js#L951), etc.).

This **prevents index usage** — PostgreSQL can't use a B-tree index when the column is wrapped in functions. Either:
1. Store IDs in normalized form (uppercase, trimmed) at write time
2. Create functional indexes: `CREATE INDEX ON work_order_data (UPPER(TRIM(work_order_id)))`

---

### 3.4 — `deleteCachePattern` Uses `KEYS` Command

In [redis.js L86-96](file:///d:/codding/App/garage_management/backend/redis.js#L86-L96):

```js
const keys = await redis.keys(pattern);
```

The `KEYS` command scans the entire Redis keyspace and **blocks the server**. In Upstash REST mode it's less catastrophic than self-hosted Redis, but it's still O(N). Consider using `SCAN` or structured cache invalidation with explicit key tracking.

---

### 3.5 — Aggressive Cache Invalidation

After nearly every mutation, the server fires multiple `deleteCachePattern("garage:cache:*")` calls. For example, after a work order status change:

```js
await deleteCachePattern("garage:cache:workorders:*");
await deleteCache(`garage:cache:workorder:details:${id}`);
```

And after intake:
```js
await deleteCachePattern("garage:cache:owners:*");
await deleteCachePattern("garage:cache:users:*");
await deleteCachePattern("garage:cache:workorders:*");
```

This essentially **nukes the entire cache on every write**, negating much of the caching benefit. Consider more surgical invalidation.

---

### 3.6 — Frontend: Zero Code Splitting

[App.js](file:///d:/codding/App/garage_management/frontend/src/App.js) imports **every single component** eagerly at the top level:

```js
import Dashboard from './components/Dashboard';
import VehicleIntake from './components/VehicleIntake';
import WorkOrders from './components/WorkOrders';
// ... 15+ more imports
```

None use `React.lazy()` + `Suspense`. The initial bundle includes all 600KB+ of component code even when the user only sees the login page.

---

### 3.7 — Frontend: No `useMemo`, No `useCallback`, No `React.memo`

Across 20+ components totaling ~600KB of JSX:
- `useMemo` is used **0 times**
- `useCallback` is used **1 time** (only in AuditLog)
- `React.memo` is used **0 times**

Heavy computations like filtering, sorting, and mapping arrays happen on every re-render. For example, in Dashboard, WorkOrders, and OwnersList, list filtering recalculates on every keystroke without memoization.

---

### 3.8 — Frontend: No Request Cancellation

No component uses `AbortController` to cancel in-flight fetch requests when unmounting. If a user navigates away quickly, stale responses can update unmounted components (React memory leak warning).

---

### 3.9 — Business Logic on the Server, Formatting on the Server

The backend does heavy presentation-layer work that belongs on the frontend:
- Currency formatting (`$${val.toFixed(2)}`) — [L210](file:///d:/codding/App/garage_management/backend/server.js#L210), [L234](file:///d:/codding/App/garage_management/backend/server.js#L234)
- "Today" vs date label computation — [L2407-2415](file:///d:/codding/App/garage_management/backend/server.js#L2407-L2415)
- Initials computation — [L1461-1464](file:///d:/codding/App/garage_management/backend/server.js#L1461-L1464), [L1672-1674](file:///d:/codding/App/garage_management/backend/server.js#L1672-L1674), [L2444-2448](file:///d:/codding/App/garage_management/backend/server.js#L2444-L2448)
- Workload percentage heuristics — [L1466-1477](file:///d:/codding/App/garage_management/backend/server.js#L1466-L1477)
- Badge/status type classification — [L2418-2440](file:///d:/codding/App/garage_management/backend/server.js#L2418-L2440)

This increases response payload size and couples the API to the UI. The API should return raw data; the frontend should format it.

---

## 4. 🐛 Bugs & Unhandled Edge Cases

### 4.1 — PATCH Inventory Doesn't Use Transaction

[L394-458](file:///d:/codding/App/garage_management/backend/server.js#L394-L458): The `PATCH /api/inventory/:id` route updates inventory then writes an audit log as **two separate queries without a transaction**. If the audit log fails, the inventory is updated but unlogged. Compare with the POST route which correctly uses `BEGIN/COMMIT`.

---

### 4.2 — Work Order Status: No State Machine Validation

[L1114-1156](file:///d:/codding/App/garage_management/backend/server.js#L1114-L1156): Status updates accept any valid status string but don't enforce a logical progression. You can go from `completed` → `received` or `in_progress` → `received`. There's no state machine enforcing:

```
received → diagnosed → in_progress → ready → completed
```

---

### 4.3 — Idempotency Middleware Hashes the Entire Request Body

[L48-50](file:///d:/codding/App/garage_management/backend/server.js#L48-L50): For large payloads (e.g., base64 media uploads with 50MB limit), the middleware stringifies the entire body and SHA-256 hashes it. This is CPU-expensive for large uploads and could degrade performance.

---

### 4.4 — `COALESCE` in PATCH Endpoints Can't Set Values to NULL

The pattern `COALESCE($1, existing_column)` used throughout (e.g., [L398-404](file:///d:/codding/App/garage_management/backend/server.js#L398-L404)) means you can **never intentionally set a field to NULL**. If you pass `null`, it keeps the old value. This is a semantic bug if clearing a field is ever needed (e.g., unassigning a staff member from a work order).

---

### 4.5 — Staff DELETE Operates on Wrong Table

[L1580](file:///d:/codding/App/garage_management/backend/server.js#L1580):
```js
await client.query("UPDATE schedules SET assigned_staff_id = NULL WHERE assigned_staff_id = $1;", [id]);
```

But the scheduling table is called `scheduled_tasks`, not `schedules`. This query silently fails (updates 0 rows) or throws if the `schedules` table doesn't exist.

---

### 4.6 — Frontend: Auth State is Only in LocalStorage

The [AuthContext.js](file:///d:/codding/App/garage_management/frontend/src/context/AuthContext.js) stores the entire user object in `localStorage` with no expiry, no session validation, and no token refresh. A user who logs in once stays "authenticated" forever, even if:
- Their account is deactivated server-side
- Their password is changed
- The server is completely down

---

### 4.7 — `database.db` in Frontend Build

The file [frontend/database.db](file:///d:/codding/App/garage_management/frontend/database.db) is inside the frontend project root and would be included in the `build/` output. This is a schema file that should never be served to clients.

---

## 5. 🧩 Missing Features & Business Logic Gaps

### 5.1 — No Pagination on Any List Endpoint

Except for audit logs, **none** of the list endpoints support pagination:
- `GET /api/inventory` — returns ALL parts
- `GET /api/work-orders` — returns ALL work orders
- `GET /api/owners` — returns ALL owners
- `GET /api/staff` — returns ALL staff
- `GET /api/users` — returns ALL users

As data grows, these endpoints will become progressively slower and the payloads larger.

---

### 5.2 — No Password Change / Reset Functionality

There's no endpoint for:
- Changing password (current user)
- Admin resetting another user's password
- "Forgot password" flow

---

### 5.3 — No Owner Edit / Update Endpoint

You can view and create car owners, but there's **no `PATCH /api/owners/:id`** to update an owner's name, phone, address, or VIP status directly.

---

### 5.4 — No Invoice Delete Endpoint

You can generate and update invoice status, but there's no endpoint to delete an invoice.

---

### 5.5 — No Soft Delete for Inventory

`DELETE /api/inventory/:id` hard-deletes parts. If a part was referenced by work order items, those historical references lose context. Should use soft delete or prevent deletion of referenced parts.

---

### 5.6 — No Data Export (CSV/PDF)

No endpoints or frontend functionality for exporting:
- Invoices as PDF
- Inventory reports as CSV
- Work order history as reports

---

### 5.7 — No Notifications / Alerts System

- No email notifications (work order status changes, low stock alerts)
- No in-app notification center
- No webhook integrations

---

### 5.8 — No Search on Work Orders List

The frontend Dashboard has search, but the `WorkOrders` component likely also needs server-side search (by VIN, owner name, status) that doesn't exist.

---

### 5.9 — Scheduling Has No Conflict Detection

The scheduling system (`POST /api/schedules`) doesn't check for:
- Double-booking the same bay at the same time
- Assigning a staff member to overlapping tasks
- Scheduling outside business hours

---

## 6. 🎨 Frontend-Specific Issues

### 6.1 — 15 Separate CSS Files with No Design System

Each component has its own CSS file with duplicated patterns. There are likely hundreds of duplicated color values, spacing values, font declarations, and animation keyframes. Should use CSS custom properties (variables) in a shared design token file.

---

### 6.2 — `showNotification` Pattern Duplicated Everywhere

Almost every component has:
```js
const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
};
```

This should be a shared hook (`useNotification`) or context.

---

### 6.3 — Sidebar State Managed Independently in Every Component

Every single page component has:
```js
const [isSidebarOpen, setIsSidebarOpen] = useState(false);
```

This should be in a layout component or context. The sidebar is a layout concern, not a page concern.

---

### 6.4 — No Loading Skeletons / Optimistic UI

All loading states show generic spinners or blank pages. Modern apps should show skeleton screens that match the layout shape.

---

### 6.5 — No Error Boundaries

If any component throws a runtime error, the entire app crashes to a white screen. React Error Boundaries are needed.

---

### 6.6 — Inline Styles in StaffLogin

[StaffLogin.jsx L86-98](file:///d:/codding/App/garage_management/frontend/src/components/StaffLogin.jsx#L86-L98) uses inline `style={{...}}` objects for the error message instead of CSS classes.

---

## 7. 📦 DevOps, Deployment & Repo Hygiene

### 7.1 — `nodemon` is a Production Dependency

In [backend/package.json](file:///d:/codding/App/garage_management/backend/package.json#L15):
```json
"dependencies": {
    "nodemon": "^3.1.14"
}
```

`nodemon` is a development tool. It should be in `devDependencies`.

---

### 7.2 — Unused `redis` Dependency

The backend imports `@upstash/redis` (which it uses), but also lists `"redis": "^6.2.1"` in dependencies — the standard `redis` npm package is **never imported or used** anywhere.

---

### 7.3 — No `build` or Validation Pipeline

- No `npm test` configured to actually run
- No CI/CD pipeline definition (GitHub Actions, etc.)
- No linting configuration beyond default CRA eslint
- The single test file ([App.test.js](file:///d:/codding/App/garage_management/frontend/src/App.test.js)) just checks if the app renders

---

### 7.4 — Frontend `build/` Directory Committed

The [frontend/build/](file:///d:/codding/App/garage_management/frontend/build) directory exists in the repo. Build artifacts should never be committed — they should be generated in CI/CD.

---

### 7.5 — No Database Migration Versioning

[migrate_neon.js](file:///d:/codding/App/garage_management/backend/migrate_neon.js) is a one-shot migration script with no versioning, no rollback capability, and no migration tracking table. As the schema evolves, you'll need a proper migration tool (e.g., `node-pg-migrate`, `knex`, or Prisma).

---

### 7.6 — Connection Pool Not Configured

[db.js](file:///d:/codding/App/garage_management/backend/db.js) creates a `Pool` with no configuration for:
- `max` connections (default is 10 — may be too many for Neon's free tier)
- `idleTimeoutMillis`
- `connectionTimeoutMillis`
- `statement_timeout` (to kill runaway queries)

---

## 8. 📊 Summary Scorecard

| Category | Score | Notes |
|---|:---:|---|
| **Security** | 🔴 2/10 | SQL injection, no auth, credentials exposed, open CORS |
| **Architecture** | 🟠 4/10 | Monolith server, no separation of concerns, massive components |
| **Backend Performance** | 🟡 5/10 | Redis caching is good, but N+1 queries, no pagination, KEYS command |
| **Frontend Performance** | 🟠 4/10 | No code splitting, no memoization, no abort controllers, no skeletons |
| **Error Handling** | 🟡 5/10 | Individual try/catch works but no global handler, no error boundaries |
| **Code Quality** | 🟡 5/10 | Consistent patterns, good comments, but heavy duplication |
| **Feature Completeness** | 🟡 6/10 | Core CRUD works well, but missing pagination, export, notifications |
| **DevOps/Deployment** | 🟠 4/10 | No CI/CD, no migration versioning, credentials in git |

---

## Priority Action Items

> [!IMPORTANT]
> ### Immediate (Do Today)
> 1. **Rotate all credentials** — Database URL and Redis token are exposed in git history
> 2. **Fix the SQL injection** in audit logs endpoint (L2328)
> 3. **Restrict CORS** to your frontend domain
> 4. **Remove `build/` directory** from git tracking

> [!WARNING]
> ### Short-Term (This Week)
> 5. **Add JWT authentication** — middleware that validates tokens on every request
> 6. **Add role-based authorization middleware** — `requireAdmin`, `requireStaff`, etc.
> 7. **Exclude password hash** from all API responses (never `SELECT *` on users table)
> 8. **Fix the wrong table name** (`schedules` → `scheduled_tasks`) in staff DELETE
> 9. **Add state machine validation** for work order status transitions
> 10. **Parameterize the audit log event_type filter** to prevent SQL injection

> [!TIP]
> ### Medium-Term (This Month)
> 11. Split `server.js` into route modules
> 12. Add `React.lazy()` code splitting to `App.js`
> 13. Add pagination to all list endpoints
> 14. Fix N+1 queries in VIN history endpoint
> 15. Extract shared hooks (`useNotification`, `useSidebar`, `useFetch`)
> 16. Add Error Boundaries to the React app
> 17. Move `nodemon` to devDependencies, remove unused `redis` package
> 18. Add a proper migration tool
