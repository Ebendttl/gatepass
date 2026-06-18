# Monorepo Memory and State Log: Gatepass Ticketing

This document serves as a persistent brain state log of architectural decisions, database schemas, active modules, and pending actions to ensure consistency and eliminate hallucinations during subsequent code iterations.

---

## 1. Project Context & Objectives
**Gatepass** is an end-to-end, high-scalability event ticketing platform. Its target specifications emulate production-scale platforms like Eventbrite, with rigorous enforcement of inventory locks and transactional security to prevent ticket counterfeiting or overselling during high-volume spikes.

---

## 2. Directory Layout & Workspace Architecture

The project is structured as an npm workspaces monorepo:

```
├── apps/
│   ├── api/                   # Node.js & Express REST API Backend
│   │   ├── src/
│   │   │   ├── db.js          # PostgreSQL Pool Connections
│   │   │   ├── index.js       # Main server entry & Redis connectors
│   │   │   ├── seed.js        # Seed scripts for mock accounts/history
│   │   │   ├── routes/
│   │   │   │   ├── auth.js    # JWT Authentication controllers
│   │   │   │   ├── checkout.js# capacity check + pg locking + Stripe simulation
│   │   │   │   ├── events.js  # Event management & hourly/daily stats analytics
│   │   │   │   └── tickets.js # Ticket retrieval, lookup, & HMAC QR validation
│   └── web/                   # Next.js 15 React Frontend (Port 3000)
│       ├── src/
│       │   ├── app/           # App Router pages (globals.css, layout, page, portals)
│       │   └── components/    # Responsive shared components (Navbar, Stats, etc.)
├── db/
│   └── migrations/            # SQL Up/Down Schemas
├── package.json               # Root monorepo workspace orchestration
└── memory.md                  # Brain state persistence document (This file)
```

---

## 3. Technology Stack & Key Configurations

### Backend Services
- **Framework**: Express.js (Port `5000`)
- **Database**: PostgreSQL 16 (Strict RDBMS + Connection Pooling)
- **Caching / Rate Limiting**: Redis 7 (Port `6379`)
- **Queueing Engine**: Bull / BullMQ (Active queue runner for mail delivery)
- **Signature Security**: HMAC-SHA256 hashing (`process.env.HMAC_QR_SECRET`)

### Frontend Client
- **Framework**: Next.js 15 (App Router, Port `3000`)
- **Styling**: Tailwind CSS v3 (Variables mapped to a custom "Dark Obsidian" theme)
- **State & Cache**: TanStack React Query v5
- **Charts / Visuals**: Recharts (Custom line and bar graphs)
- **Scanner**: `jsQR` webcam feed frame processor

---

## 4. Key Engineering Implementations

### Concurrency Lock (PostgreSQL Row Locks)
To eliminate race conditions when multiple customers buy tickets for limited capacities at the same millisecond:
- Wrapping checkouts in database transactions (`BEGIN...COMMIT`).
- Locking target records using `SELECT FOR UPDATE` on the ticket tier row:
  ```sql
  SELECT sold_qty, total_qty FROM ticket_tiers WHERE id = $1 FOR UPDATE;
  ```
- Adjusting capacity increments atomically prior to concluding the transaction.

### Redis Queue (Waiting Room)
When ticket purchase demand is heavy (event capacities $\ge$ 1,000):
- Users are routed to a waiting room queue built using Redis sorted-sets (`ZADD` scored by entry timestamps).
- Clients poll `/api/queue/status/:token` to get their position (`ZRANK`).
- Once active, they receive a 5-minute signed token enabling checkout access.

### Cryptographic QR Signatures
- Ticket verification is guaranteed via cryptographically signed QR payloads:
  $$\text{HMAC-SHA256}(\text{Ticket ID} \mathbin{\Vert} \text{Event ID} \mathbin{\Vert} \text{Tier ID}, \text{SecretKey})$$
- Prevents database forgery and guarantees offline/online validation.

---

## 5. Development Credentials & Mock Data

The `apps/api/src/seed.js` script clears the database and populates it with:
- **Organizer Login**: `organizer@gatepass.com` / `password123`
- **Staff Login**: `staff@gatepass.com` / `staff123`
- **Seeded Events**:
  - `Tech Con 2026` (VIP and General Admission tiers)
  - `Rock Festival 2026` (Early Bird tier)
- **Purchase History**: 10 mock buyer entries distributed historically to show charts on the Organizer Dashboard.

---

## 6. Next Steps & Roadmap

1. **Stripe Real-World Webhooks**: Swap the mock success route with a real Stripe element flow and validation webhook.
2. **Email Delivery Integrations**: Connect Resend or SendGrid templates to BullMQ email tasks.
3. **Database Schema Enhancements**: Integrate a migration runner (e.g. `db-migrate` or Prisma) instead of raw `.sql` manual files.
4. **Offline Scanner Mode**: Implement service workers to cache validation checks for offline events.

---

## 7. Production Deployment & Live Environment

### Cloud Infrastructure (Hybrid Model)
- **Backend API Service (`apps/api`)**: Deployed on **Render** as a Web Service.
  - Live API URL: `https://gatepass-api-uuyv.onrender.com`
  - Environment Configuration: `NODE_ENV=production`, custom JWT/HMAC keys.
- **Frontend Client (`apps/web`)**: Deployed on **Vercel** pointing to the Render backend via `NEXT_PUBLIC_API_URL`.
- **Database (Relational)**: Serverless PostgreSQL hosted on **Neon**.
- **Cache & Queue (Redis)**: Serverless Redis hosted on **Upstash** (configured with secure `rediss://` TLS protocol).

### Key Production Patches
1. **Dynamic SSL Handling (`apps/api/src/db.js`)**:
   Adjusted the node-postgres Pool configuration to dynamically request SSL connections (`rejectUnauthorized: false`) for cloud databases (Neon/Render) while allowing unencrypted fallback for local development.
2. **Cloud-Native Seeding**:
   Seeded the live Neon database directly in the cloud environment via a temporary Render build pipeline command (`npm run seed && npm start`), bypassing local network port-5432 restrictions.
3. **Hydration Warning Mitigation (`apps/web/src/app/layout.tsx`)**:
   Suppressed hydration mismatch prompts triggered by browser wallet extensions by appending `suppressHydrationWarning` to the root `<html>` tag.
4. **Vercel Next.js Vulnerability Blocker**:
   Upgraded Next.js and its dependencies to a secure patched version (`^15.1.12` resolving to `15.5.19`) to bypass Vercel's automated Remote Code Execution (RCE) security checks.
5. **Monorepo Dependency Consolidation**:
   Forced root hoisting of `react` and `react-dom` by adding them to the root `package.json` devDependencies and deleted the duplicate `/apps/web/package-lock.json` file. This prevents module resolution collisions between the root and workspaces during production builds.
6. **Startup Auto-Migrations**:
   Configured the backend API (`apps/api/src/db.js`) to automatically read and execute `/db/migrations/01_init.up.sql` on startup, making the service database-independent and self-initializing on new cloud deploys.
7. **Client API Endpoint Centralization**:
   Replaced hardcoded `localhost:5000` URLs across all Next.js pages with a centralized config constant (`apps/web/src/config.ts`) backing `process.env.NEXT_PUBLIC_API_URL` to solve production connection failures.
