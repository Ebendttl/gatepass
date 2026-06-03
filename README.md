# Gatepass Event Ticketing Platform

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3-38bdf8?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Express.js](https://img.shields.io/badge/Express-v4-000000?style=flat&logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-dc382d?style=flat&logo=redis)](https://redis.io/)

Gatepass is a production-grade, highly scalable event ticketing platform (equivalent in functional scope to Eventbrite) engineered with robust concurrency locks to prevent ticket overselling, Redis sorted-set queues for high-traffic "Waiting Rooms", and cryptographically signed QR code validation to block ticket counterfeiting.

The codebase is organized as an npm workspaces monorepo containing a high-fidelity **Next.js App Router** frontend and a robust **Express REST API** backend.

---

## 🚀 Key Features

*   **⚡ Premium Obsidian UI**: Built with a sleek, responsive dark-mode layout, glassmorphic containers, custom scrollbars, and Outfit/Outfit-inspired typography.
*   **🛒 Tiered Ticket Selection**: Supports multiple ticket pricing structures (e.g. VIP, General Admission, Early Bird) with active inventory progression.
*   **🔒 Concurrency Control**: wrapped in strict SQL Transactions using `SELECT FOR UPDATE` row-level locks, fully blocking double-booking race conditions during checkout.
*   **🎟️ Redis Waiting Room**: Automatically queues users when demand surges (capacities $\ge$ 1,000) using Redis sorted-sets, providing live rank updates before granting checkouts.
*   **💳 Stripe Elements Simulator**: Handles mocked transactions safely, routing success payloads directly to standard webhooks.
*   **🔑 Secure Cryptographic QR Codes**: Generates validation payloads signed with HMAC-SHA256 server secrets. Scanned tickets verify signatures and block duplicate check-ins.
*   **📊 Organizer Dashboard**: High-fidelity UI with Recharts analytics displaying total revenue, conversions, tier progress, and dual-state Line Charts (toggleable daily/hourly resolution).
*   **📷 Web Camera Scanner**: Integrates webcam captures using `jsqr` to perform live validations in real-time, with manual file upload and copy-paste fallback routes.

---

## 📐 System Architecture

```mermaid
flowchart TD
    Client[Next.js Frontend Client] -->|Checkout API Request| API[Express API Server]
    API -->|1. Check Queue Position| Redis[(Redis Waiting Room)]
    API -->|2. Row-Level SELECT FOR UPDATE| DB[(PostgreSQL Database)]
    API -->|3. Create PaymentIntent| Stripe[Stripe Simulation API]
    API -->|4. Push confirmation jobs| BullMQ[Bull Queue / Workers]
    BullMQ -->|5. Deliver email passes| SMTP[Nodemailer / SMTP Server]
```

---

## 🛠️ Technical Stack

### Frontend Client (`/apps/web`)
*   **Core**: Next.js 15 (App Router), React 19, TypeScript.
*   **Styling**: Tailwind CSS v3 (Variables mapped to obsidian tokens).
*   **State & Caching**: TanStack React Query v5.
*   **Charts**: Recharts (Custom Bar and Line charts).
*   **Icons**: Lucide React.
*   **QR Scanner**: `jsQR` (webcam frame processing).

### Backend REST API (`/apps/api`)
*   **Core**: Node.js, Express.js.
*   **Database**: PostgreSQL 16 (using the Node-Postgres `pg` driver for transactional queries).
*   **Queue / Cache**: Redis 7, Bull (for background mail queues).
*   **Auth**: JWT (Stateless access & refresh tokens) and bcrypt (factor 12 hashing).

---

## 🔒 Crucial Engineering Designs

### 1. PostgreSQL Transaction Integrity
To prevent double-booking, checkout operations are encapsulated in database transactions with strict row-level locks. This blocks other threads from updating ticket inventory until the current transaction commits or rolls back:

```javascript
const client = await db.pool.connect();
try {
  await client.query('BEGIN');

  // Obtain exclusive row lock on the ticket tier
  const tierResult = await client.query(
    'SELECT sold_qty, total_qty FROM ticket_tiers WHERE id = $1 FOR UPDATE',
    [tierId]
  );
  const tier = tierResult.rows[0];

  if (tier.sold_qty + quantity > tier.total_qty) {
    throw new Error('TIER_FULL');
  }

  // Increment sold capacity
  await client.query(
    'UPDATE ticket_tiers SET sold_qty = sold_qty + $1 WHERE id = $2',
    [quantity, tierId]
  );

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

### 2. Redis Sorted-Set Waiting Room Queue
High-demand events can overwhelm database connections. To protect DB query pooling, events with capacities $\ge$ 1,000 route buyers to a Redis queue:
*   Users join the queue with:
    `ZADD queue:<eventId> <timestamp> <email>`
*   Clients poll their position using:
    `ZRANK queue:<eventId> <email>`
*   Once a user reaches the front of the queue, they receive a signed JWT token valid for exactly **5 minutes** to finish checkout.

### 3. Cryptographic QR Verification
All ticket QR codes are signed on the server to prevent counterfeiting or guessing UUIDs:
$$\text{Signature} = \text{HMAC-SHA256}(\text{ticket\_id} \mathbin{\Vert} \text{event\_id} \mathbin{\Vert} \text{tier\_id}, \text{HMAC\_QR\_SECRET})$$

During verification, the scanning server parses the ticket UUID, recalculates the signature, and matches it against the payload signature. This prevents malicious ticket forging.

---

## ⚙️ Quick Start & Installation

### Prerequisites
*   Node.js 18+ & npm
*   PostgreSQL running on port `5432`
*   Redis running on port `6379`

### 1. Setup Environment Configurations
Create `.env` files in both workspace directories.

#### **Backend (`apps/api/.env`)**:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gatepass
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=supersecretaccesskeygatepass2026!
JWT_REFRESH_SECRET=supersecretrefreshkeygatepass2026!
STRIPE_SECRET_KEY=sk_test_mock_stripe_key_gatepass
STRIPE_WEBHOOK_SECRET=whsec_mock_webhook_secret_gatepass
HMAC_QR_SECRET=hmac_qr_verification_secret_gatepass_2026
```

### 2. Install Dependencies
Run npm workspace installation in the root folder:
```bash
npm install --legacy-peer-deps
```

### 3. Run Database Migrations & Seeds
Initialize database tables and populate the mock data (test events, tiers, historical sales, and user accounts):
```bash
# Seed the database
npm run seed
```

### 4. Run Development Servers
Start both the Express API and Next.js frontend concurrently using the root dev command:
```bash
npm run dev
```
*   **Next.js Frontend**: [http://localhost:3000](http://localhost:3000)
*   **Express API Backend**: [http://localhost:5000](http://localhost:5000)

---

## 🔑 Test Credentials & Accounts

The database seed script sets up the following accounts for sandbox validation:

| Role | Email | Password | Purpose |
| :--- | :--- | :--- | :--- |
| **Organizer** | `organizer@gatepass.com` | `password123` | View dashboard, create events, customize tiers, track metrics |
| **Staff Scanner** | `staff@gatepass.com` | `staff123` | Scan ticket QR codes, check ticket authenticity |
| **Buyer Pass 1** | `buyer1@gmail.com` | N/A | Retrieve seeded tickets under "My Tickets" tab |