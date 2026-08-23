# 🏎️ Precision Garage — Enterprise Workshop Management System

A high-performance, full-stack automotive workshop operating system designed for modern garages, service centers, and fleet repair facilities. Built with React, Node.js, Express, Serverless PostgreSQL (Neon), and Upstash Redis.

---

## 📌 Architecture Overview

```
                                 ┌─────────────────────────────────┐
                                 │     React Frontend Client       │
                                 │   (Vercel / Local Vite/CRA)     │
                                 └──────────────┬──────────────────┘
                                                │
                                                ▼ HTTP / REST (with X-Idempotency-Key)
                                 ┌─────────────────────────────────┐
                                 │     Node.js / Express API       │
                                 │     (Render Cloud Backend)      │
                                 └────────┬──────────────┬─────────┘
                                          │              │
                    Distributed Locks &   │              │   Relational SQL
                    Fast Query Caching    │              │   & Transactions
                                          ▼              ▼
                              ┌───────────────┐  ┌───────────────┐
                              │ Upstash Redis │  │   Neon Cloud  │
                              │ (Serverless)  │  │  PostgreSQL   │
                              └───────────────┘  └───────────────┘
```

---

## 🛠️ Technology Stack & Cloud Infrastructure

### 1. Frontend Client
- **Framework**: React 18 (SPA)
- **Routing**: React Router DOM v6 with role-based route guards (`/dashboard`, `/staff/dashboard`, `/owner/cars`)
- **UI & Icons**: Vanilla CSS Glassmorphism Design System, Material UI Icons (`@mui/icons-material`), Google Fonts (*Outfit*, *JetBrains Mono*, *Inter*)
- **State & Auth**: React Context API (`AuthContext`), LocalStorage session persistence
- **Concurrency & Deduplication**: Custom global `window.fetch` interceptor with in-flight Promise mutex deduplication and automatic `X-Idempotency-Key` injection
- **Deployment**: Configured for **Vercel** with clean ESLint compilation

### 2. Backend API
- **Runtime**: Node.js (ES Modules)
- **Web Framework**: Express.js REST API
- **Middleware**: CORS, Body Parser, Custom Idempotency & Distributed Lock Middleware (`idempotencyMiddleware`)
- **Deployment**: Hosted live on **Render Cloud** (`https://garage-management-hy5h.onrender.com`)

### 3. Database Layer
- **Engine**: **Neon Serverless PostgreSQL**
- **Connection**: Pooled SSL connection (`pg` Pool)
- **Features**: Relational schemas (`car_owners`, `vehicles`, `work_orders`, `work_order_items`, `inventory_data`, `work_order_media`, `schedules`, `invoices`, `user_accounts`), atomic SQL transactions (`BEGIN ... COMMIT / ROLLBACK`), foreign key constraints with safe restock triggers on deletion

### 4. Cache & Distributed Lock Layer
- **Engine**: **Upstash Redis** (Serverless REST Client via `@upstash/redis`)
- **Use Cases**:
  - **KPI & Dashboard Caching**: High-speed retrieval of workshop KPIs, inventory totals, and repair queues.
  - **Distributed Idempotency Mutex**: Atomic `SET lock:<key> in_progress NX EX 15` locking to prevent race conditions and duplicate writes.
  - **Response Replay**: Caching 2xx responses for 60 seconds to safely replay idempotent retries.

---

## 👥 User Roles & Access Control Model (RBAC)

The application implements a 3-tier Role-Based Access Control (RBAC) system:

| Feature / Capability | 👑 Admin Superuser (`admin`) | 🔧 Staff / Technician (`staff`) | 🚗 Car Owner (`car_owner`) |
| :--- | :---: | :---: | :---: |
| **System Dashboard & Telemetry** | Full Access | Redirected to Staff Hub | Redirected to My Garage |
| **Vehicle Intake & Work Order Creation** | Full Access | Read / Execute Assigned | ❌ View Only |
| **Work Order Repair Status Advancement** | Full Access | Full Access (Execution Hub) | ❌ Read Only (Live Status) |
| **Parts & Labor Bill of Materials (BOM)** | Full Access | Add Parts & Labor to Orders | ❌ View Breakdown |
| **Inspection Photo / Media Upload** | Full Access | Full Access | ❌ View Only |
| **Delete Work Orders (Receive/Diagnose)** | Full Access | ❌ Restricted | ❌ Restricted |
| **Inventory Catalog: Add / Edit / Restock** | Full Access | 👁️ View-Only Catalog | ❌ No Access |
| **Bay Scheduling & Task Allocation** | Full Access | View Assigned Schedule | ❌ No Access |
| **Invoicing & PDF Tax Invoice Generation** | Full Access | Mark as Paid | View Invoices |
| **User & Account Management** | Full Access | ❌ No Access | ❌ No Access |

---

## 🎯 Core Functional Modules

### 1. 📋 Vehicle Intake & Work Order Generation
- Quick VIN lookup and vehicle registration (Make, Model, Year, License Plate).
- Customer linking (search existing database customers or register new owner on the fly).
- Initial observation logging and automatic creation of sequential Work Orders (`WO-2026-XXXX`).

### 2. ⚡ Staff Execution Hub (`/staff/work-orders/:id`)
- **Lifecycle Stepper**: Visual progression through repair stages:
  1. `RECEIVED` $\rightarrow$ 2. `DIAGNOSED` $\rightarrow$ 3. `IN_PROGRESS` $\rightarrow$ 4. `READY FOR PICKUP` $\rightarrow$ 5. `COMPLETED`.
- **Workshop Details**: Assign repair bays (`B1` - `B6`), assign lead technicians, and update estimated repair costs.
- **Parts & Labor BOM**:
  - Direct selection from the live inventory catalog with automated price calculation and stock reduction.
  - Custom labor hours tracking with hourly rate computation.
- **Vehicle Inspection Media**: Attach photos across 4 category tags: *Vehicle Intake Condition*, *Part Damage Diagnosis*, *Repair In Progress*, and *Completed Quality Check*.

### 3. 🛡️ Safe Work Order Lifecycle & Inventory Restocking
- **Early-Stage Deletion**: Work orders in `received` or `diagnosed` status can be deleted safely if created by mistake.
- **Automated Inventory Restocking**: Deleting a work order automatically restores all assigned parts back into the inventory stock.
- **Execution Lock**: Once repair begins (`in_progress`, `ready`, `completed`), deletion is strictly prohibited to preserve billing and audit integrity.

### 4. 📦 Inventory Management (`/inventory`)
- Real-time stock tracking with low-stock threshold triggers and restock alerts.
- Stock valuation KPIs (Total Value, Low Stock Alerts, SKUs count).
- **Staff View-Only Mode**: Staff accounts have a dedicated read-only catalog view without edit/restock/delete permissions.

### 5. 📅 Scheduling & Bay Assignment (`/scheduling`)
- 7-day interactive workshop calendar.
- Bay assignment (`Bay 1` to `Bay 6`) and technician task allocation.
- Standalone tasks or work-order-linked scheduling.

### 6. 🧾 Invoicing & PDF Generation (`/invoices`)
- Automatic Tax Invoice creation from completed work orders.
- Itemized breakdown of parts, labor hours, tax calculation, and payment status tracking (`unpaid`, `paid`, `overdue`).
- In-browser interactive Tax Invoice modal with print/PDF export capability.

### 7. 🚘 Customer Portal (`/owner/cars`)
- Authenticated car owners can view all their registered vehicles, active repair progress, technician notes, and historical invoices.

---

## 🔒 Enterprise Concurrency & Duplicate Prevention

To eliminate accidental duplicate requests (e.g., rapid button clicks on slow networks resulting in multiple parts added or duplicate orders):

1. **Client In-Flight Mutex (`src/config/api.js`)**:
   - Universal `fetch` wrapper intercepts mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
   - Deduplicates identical concurrent in-flight requests into a single shared Promise.
   - Attaches a unique `X-Idempotency-Key` to every request.
2. **Backend Distributed Mutex (`backend/server.js` + `backend/redis.js`)**:
   - Upstash Redis atomic mutex (`SET key in_progress NX EX 15`).
   - If an identical request arrives while one is processing, the server rejects it with `409 Conflict` (`duplicate: true`).
   - Caches successful 2xx responses for 60 seconds to safely replay duplicate responses without touching the PostgreSQL database.
3. **UI Form Hardening**:
   - All submit buttons across all pages display loading indicators (`"Adding to Order..."`, `"Processing Intake..."`, `"Saving..."`) and are disabled during request lifecycle.
   - Replaced all browser `window.confirm` alerts with custom glassmorphism modal overlays.

---

## 📁 Directory Structure

```
garage_management/
├── backend/
│   ├── db.js                 # PostgreSQL connection pool (Neon Cloud)
│   ├── redis.js              # Upstash Redis client, distributed locks & cache helpers
│   ├── server.js             # Express API, REST endpoints, idempotency middleware
│   ├── package.json          # Backend dependencies
│   └── .env                  # Backend secrets (DATABASE_URL, UPSTASH_REDIS_URL, etc.)
│
├── frontend/
│   ├── public/               # Static assets & HTML template
│   ├── src/
│   │   ├── components/       # Admin & Shared Components
│   │   │   ├── Dashboard.jsx        # Telemetry, KPIs, active queues
│   │   │   ├── VehicleIntake.jsx    # Intake registration & customer linking
│   │   │   ├── WorkOrders.jsx       # Order list, filters, early-stage deletion
│   │   │   ├── WorkOrderDetails.jsx # Detailed work order view, invoice trigger
│   │   │   ├── Inventory.jsx        # Parts catalog, stock alerts, staff view-only
│   │   │   ├── Scheduling.jsx       # 7-day interactive bay schedule
│   │   │   ├── Invoices.jsx         # Tax invoice list & PDF viewer
│   │   │   ├── UserManagement.jsx   # Role assignments & account creation
│   │   │   ├── Staff.jsx            # Staff profiles & rate management
│   │   │   ├── OwnersList.jsx       # Customer database directory
│   │   │   ├── OwnerDetail.jsx      # Individual customer profile & vehicle history
│   │   │   ├── StaffLogin.jsx       # Unified portal authentication login
│   │   │   └── Sidebar.jsx          # Collapsible responsive navigation bar
│   │   ├── staff/            # Technician Working Hub
│   │   │   ├── StaffDashboard.jsx   # Technician active queue & quick-advance
│   │   │   ├── WorkOrderExecution.jsx # Repair execution hub, BOM, inspection photos
│   │   │   └── StaffSchedules.jsx   # Technician weekly schedule view
│   │   ├── owner/            # Customer Portal
│   │   │   └── OwnerCars.jsx        # Car owner vehicle inspection & repair status
│   │   ├── context/
│   │   │   └── AuthContext.js       # Global authentication & role management
│   │   ├── config/
│   │   │   └── api.js               # API URL configuration & global in-flight mutex fetch
│   │   ├── App.jsx                  # Main routing & protected route definitions
│   │   └── index.css                # Global theme variables & typography
│   ├── package.json          # Frontend dependencies & build scripts
│   └── README.md             # Frontend documentation
└── README.md                 # Project root documentation
```

---

## ⚙️ Environment Variables Setup

### Frontend (`frontend/.env`)
```env
REACT_APP_API_BASE_URL=https://garage-management-hy5h.onrender.com/api
# For local backend development:
# REACT_APP_API_BASE_URL=http://localhost:5000/api
```

### Backend (`backend/.env`)
```env
PORT=5000
DATABASE_URL=postgresql://neondb_owner:npg_MnEUA5DI8rGd@ep-square-lab-axos9voe-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
UPSTASH_REDIS_REST_URL=https://on-basilisk-103918.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token_here
```

---

## 🚀 Running Locally

### 1. Start Backend Server
```bash
cd garage_management/backend
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2. Start Frontend Application
```bash
cd garage_management/frontend
npm install
npm start
```
Frontend runs on `http://localhost:3000`.

### 3. Production Build
```bash
cd garage_management/frontend
npm run build
```
Creates an optimized production bundle in `build/` ready for Vercel deployment.

---

## 📜 License
Private & Confidential — Built for Precision Automotive Workshop Management.
