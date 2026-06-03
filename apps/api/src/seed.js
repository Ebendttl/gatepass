const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');
require('dotenv').config();

// Helper to generate signed QR payloads
function generateSignedQrPayload(ticketId, eventId, tierId) {
  const secret = process.env.HMAC_QR_SECRET || 'default_hmac_secret';
  const data = `${ticketId}:${eventId}:${tierId}`;
  const hmac = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return JSON.stringify({
    ticket_id: ticketId,
    event_id: eventId,
    tier_id: tierId,
    hmac_signature: hmac
  });
}

async function seed() {
  console.log('Starting database seeding...');
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Clean existing data
    console.log('Cleaning existing tables...');
    await client.query('TRUNCATE users, events, ticket_tiers, tickets CASCADE');

    // 2. Create 1 Organizer
    console.log('Creating organizer user...');
    const organizerEmail = 'organizer@gatepass.com';
    const passwordHash = await bcrypt.hash('password123', 12);
    const organizerResult = await client.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ($1, $2, 'organizer') RETURNING id`,
      [organizerEmail, passwordHash]
    );
    const organizerId = organizerResult.rows[0].id;
    console.log(`Organizer created with ID: ${organizerId}`);

    // Create 1 Staff User
    console.log('Creating staff user...');
    const staffEmail = 'staff@gatepass.com';
    const staffPasswordHash = await bcrypt.hash('staff123', 12);
    await client.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ($1, $2, 'staff')`,
      [staffEmail, staffPasswordHash]
    );
    console.log('Staff user created.');

    // 3. Create 2 Events
    console.log('Creating events...');
    const now = new Date();
    
    // Event 1: Tech Con 2026 (in 30 days)
    const techConStart = new Date();
    techConStart.setDate(now.getDate() + 30);
    const event1Result = await client.query(
      `INSERT INTO events (organizer_id, title, banner_url, start_at, location, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [
        organizerId,
        'Tech Con 2026',
        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&auto=format&fit=crop&q=60',
        techConStart,
        'San Francisco Moscone Center, CA'
      ]
    );
    const event1Id = event1Result.rows[0].id;

    // Event 2: Rock Festival 2026 (in 45 days)
    const rockFestStart = new Date();
    rockFestStart.setDate(now.getDate() + 45);
    const event2Result = await client.query(
      `INSERT INTO events (organizer_id, title, banner_url, start_at, location, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [
        organizerId,
        'Rock Festival 2026',
        'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=60',
        rockFestStart,
        'Austin City Limits, TX'
      ]
    );
    const event2Id = event2Result.rows[0].id;
    console.log('Events created successfully.');

    // 4. Create 3 Ticket Tiers
    console.log('Creating ticket tiers...');
    // Event 1 Tiers: VIP ($150) and General Admission ($50)
    const vipTierResult = await client.query(
      `INSERT INTO ticket_tiers (event_id, name, price_cents, total_qty, sold_qty) 
       VALUES ($1, $2, $3, $4, 0) RETURNING id`,
      [event1Id, 'VIP Pass', 15000, 50]
    );
    const vipTierId = vipTierResult.rows[0].id;

    const gaTierResult = await client.query(
      `INSERT INTO ticket_tiers (event_id, name, price_cents, total_qty, sold_qty) 
       VALUES ($1, $2, $3, $4, 0) RETURNING id`,
      [event1Id, 'General Admission', 5000, 200]
    );
    const gaTierId = gaTierResult.rows[0].id;

    // Event 2 Tier: Early Bird ($80)
    const earlyBirdTierResult = await client.query(
      `INSERT INTO ticket_tiers (event_id, name, price_cents, total_qty, sold_qty) 
       VALUES ($1, $2, $3, $4, 0) RETURNING id`,
      [event2Id, 'Early Bird', 8000, 150]
    );
    const earlyBirdTierId = earlyBirdTierResult.rows[0].id;
    console.log('Ticket tiers created successfully.');

    // 5. Create 10 Test Purchases
    // We will distribute the dates of these purchases to create realistic charts
    console.log('Creating 10 test purchases...');
    const buyers = [
      { email: 'buyer1@gmail.com', tierId: gaTierId, eventId: event1Id, status: 'UNUSED', daysAgo: 4 },
      { email: 'buyer2@gmail.com', tierId: gaTierId, eventId: event1Id, status: 'UNUSED', daysAgo: 3 },
      { email: 'buyer3@gmail.com', tierId: gaTierId, eventId: event1Id, status: 'USED', daysAgo: 3 },
      { email: 'buyer4@gmail.com', tierId: vipTierId, eventId: event1Id, status: 'UNUSED', daysAgo: 2 },
      { email: 'buyer5@gmail.com', tierId: vipTierId, eventId: event1Id, status: 'UNUSED', daysAgo: 2 },
      { email: 'buyer6@gmail.com', tierId: gaTierId, eventId: event1Id, status: 'UNUSED', daysAgo: 1 },
      { email: 'buyer7@gmail.com', tierId: gaTierId, eventId: event1Id, status: 'USED', daysAgo: 1 },
      { email: 'buyer8@gmail.com', tierId: vipTierId, eventId: event1Id, status: 'CANCELLED', daysAgo: 1 },
      { email: 'buyer9@gmail.com', tierId: earlyBirdTierId, eventId: event2Id, status: 'UNUSED', daysAgo: 2 },
      { email: 'buyer10@gmail.com', tierId: earlyBirdTierId, eventId: event2Id, status: 'UNUSED', daysAgo: 0 }
    ];

    for (const buyer of buyers) {
      const ticketId = crypto.randomUUID();
      const qrPayload = generateSignedQrPayload(ticketId, buyer.eventId, buyer.tierId);
      
      // Calculate purchase timestamp
      const purchaseDate = new Date();
      purchaseDate.setDate(purchaseDate.getDate() - buyer.daysAgo);
      // Give them some random hours to make chart look nicer
      purchaseDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

      // Insert Ticket
      await client.query(
        `INSERT INTO tickets (id, event_id, tier_id, buyer_email, qr_payload, status, created_at, scanned_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          ticketId, 
          buyer.eventId, 
          buyer.tierId, 
          buyer.email, 
          qrPayload, 
          buyer.status, 
          purchaseDate, 
          buyer.status === 'USED' ? new Date(purchaseDate.getTime() + 2 * 3600 * 1000) : null
        ]
      );

      // Update sold quantity if the ticket wasn't cancelled
      if (buyer.status !== 'CANCELLED') {
        await client.query(
          'UPDATE ticket_tiers SET sold_qty = sold_qty + 1 WHERE id = $1',
          [buyer.tierId]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Database successfully seeded with mock data!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', error);
  } finally {
    client.release();
    process.exit();
  }
}

seed();
