const express = require('express');
const db = require('../db');
const redisClient = require('../redis');
const { authenticateToken, requireOrganizer } = require('../auth');

const router = express.Router();

// GET /api/events - List active events (public)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*, u.email as organizer_email 
       FROM events e 
       JOIN users u ON e.organizer_id = u.id 
       WHERE e.status = 'active' 
       ORDER BY e.start_at ASC`
    );
    return res.json({ events: result.rows });
  } catch (error) {
    console.error('List events error:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve events', 
      code: 'INTERNAL_SERVER_ERROR', 
      message: error.message, 
      stack: error.stack 
    });
  }
});

// GET /api/events/organizer - List organizer's own events (authenticated)
router.get('/organizer', authenticateToken, requireOrganizer, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM events WHERE organizer_id = $1 ORDER BY start_at DESC',
      [req.user.id]
    );
    return res.json({ events: result.rows });
  } catch (error) {
    console.error('List organizer events error:', error);
    return res.status(500).json({ error: 'Failed to retrieve events', code: 'INTERNAL_SERVER_ERROR' });
  }
});

// GET /api/events/:id - Get detailed event info + tiers (public)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Increment view count in Redis
    try {
      await redisClient.incr(`event:views:${id}`);
    } catch (redisErr) {
      console.error('Redis views counter error:', redisErr);
    }

    const eventResult = await db.query(
      `SELECT e.*, u.email as organizer_email 
       FROM events e 
       JOIN users u ON e.organizer_id = u.id 
       WHERE e.id = $1`,
      [id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }

    const tiersResult = await db.query(
      'SELECT id, name, price_cents, total_qty, sold_qty FROM ticket_tiers WHERE event_id = $1 ORDER BY price_cents ASC',
      [id]
    );

    return res.json({
      event: eventResult.rows[0],
      tiers: tiersResult.rows
    });
  } catch (error) {
    console.error('Get event details error:', error);
    return res.status(500).json({ error: 'Failed to retrieve event details', code: 'INTERNAL_SERVER_ERROR' });
  }
});

// POST /api/events - Create event + tiers (authenticated, organizer only)
router.post('/', authenticateToken, requireOrganizer, async (req, res) => {
  const { title, banner_url, start_at, location, tiers } = req.body;

  if (!title || !start_at || !location || !tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ error: 'Title, start_at, location, and at least one ticket tier are required', code: 'BAD_REQUEST' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert Event
    const eventResult = await client.query(
      `INSERT INTO events (organizer_id, title, banner_url, start_at, location, status) 
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING *`,
      [req.user.id, title, banner_url || null, start_at, location]
    );
    const event = eventResult.rows[0];

    // 2. Insert Ticket Tiers
    const insertedTiers = [];
    for (const tier of tiers) {
      const { name, price_cents, total_qty } = tier;
      if (!name || price_cents === undefined || !total_qty) {
        throw new Error('Invalid ticket tier properties');
      }

      const tierResult = await client.query(
        `INSERT INTO ticket_tiers (event_id, name, price_cents, total_qty, sold_qty) 
         VALUES ($1, $2, $3, $4, 0) RETURNING *`,
        [event.id, name, price_cents, total_qty]
      );
      insertedTiers.push(tierResult.rows[0]);
    }

    await client.query('COMMIT');
    return res.status(201).json({ event, tiers: insertedTiers });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create event transaction error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create event', code: 'INTERNAL_SERVER_ERROR' });
  } finally {
    client.release();
  }
});

// PUT /api/events/:id - Edit event details (authenticated, organizer only)
router.put('/:id', authenticateToken, requireOrganizer, async (req, res) => {
  const { id } = req.params;
  const { title, banner_url, start_at, location, status } = req.body;

  try {
    // Verify ownership
    const checkResult = await db.query('SELECT organizer_id FROM events WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }
    if (checkResult.rows[0].organizer_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to modify this event', code: 'FORBIDDEN' });
    }

    const updateResult = await db.query(
      `UPDATE events 
       SET title = COALESCE($1, title), 
           banner_url = COALESCE($2, banner_url), 
           start_at = COALESCE($3, start_at), 
           location = COALESCE($4, location),
           status = COALESCE($5, status)
       WHERE id = $6 RETURNING *`,
      [title, banner_url, start_at, location, status, id]
    );

    // Mock buyer notification trigger
    const updatedEvent = updateResult.rows[0];
    const buyersResult = await db.query(
      'SELECT DISTINCT buyer_email FROM tickets WHERE event_id = $1',
      [id]
    );
    const buyers = buyersResult.rows.map(r => r.buyer_email);

    if (buyers.length > 0) {
      console.log(`[Notification STUB] Notifying ${buyers.length} buyers about updates to event: ${updatedEvent.title}`);
      // In production, we'd queue update notifications here.
    }

    return res.json({ event: updatedEvent, notifiedBuyersCount: buyers.length });
  } catch (error) {
    console.error('Edit event error:', error);
    return res.status(500).json({ error: 'Failed to update event', code: 'INTERNAL_SERVER_ERROR' });
  }
});

// POST /api/events/:id/cancel - Cancel event (authenticated, organizer only)
router.post('/:id/cancel', authenticateToken, requireOrganizer, async (req, res) => {
  const { id } = req.params;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Verify ownership
    const checkResult = await client.query('SELECT organizer_id, title FROM events WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }
    if (checkResult.rows[0].organizer_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to cancel this event', code: 'FORBIDDEN' });
    }

    // Cancel event
    const cancelResult = await client.query(
      "UPDATE events SET status = 'cancelled' WHERE id = $1 RETURNING *",
      [id]
    );
    const event = cancelResult.rows[0];

    // Cancel all tickets
    await client.query(
      "UPDATE tickets SET status = 'CANCELLED', updated_at = NOW() WHERE event_id = $1",
      [id]
    );

    // Notify buyers
    const buyersResult = await client.query(
      'SELECT DISTINCT buyer_email FROM tickets WHERE event_id = $1',
      [id]
    );
    const buyers = buyersResult.rows.map(r => r.buyer_email);

    await client.query('COMMIT');

    if (buyers.length > 0) {
      console.log(`[Notification STUB] Notifying ${buyers.length} buyers about cancellation of event: ${event.title}`);
      // In production, queue refund/cancellation emails here.
    }

    return res.json({ event, cancelledTicketsCount: buyersResult.rows.length, notifiedBuyersCount: buyers.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel event error:', error);
    return res.status(500).json({ error: 'Failed to cancel event', code: 'INTERNAL_SERVER_ERROR' });
  } finally {
    client.release();
  }
});

// GET /api/events/:id/analytics - Aggregated event analytics (authenticated, organizer only)
router.get('/:id/analytics', authenticateToken, requireOrganizer, async (req, res) => {
  const { id } = req.params;
  const { group } = req.query; // 'hour' or 'day' (default: 'day')
  const timeGroup = group === 'hour' ? 'hour' : 'day';

  try {
    // 1. Verify ownership
    const checkResult = await db.query('SELECT organizer_id FROM events WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found', code: 'EVENT_NOT_FOUND' });
    }
    if (checkResult.rows[0].organizer_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to view analytics', code: 'FORBIDDEN' });
    }

    // 2. Fetch page views from Redis
    let views = 0;
    try {
      const viewsVal = await redisClient.get(`event:views:${id}`);
      views = viewsVal ? parseInt(viewsVal) : 0;
    } catch (redisErr) {
      console.error('Redis read error:', redisErr);
    }

    // 3. Summary KPIs (Total Revenue, Total Tickets Sold, Tiers metrics)
    const tiersResult = await db.query(
      `SELECT 
        id, 
        name, 
        price_cents, 
        total_qty, 
        sold_qty,
        (sold_qty * price_cents) as tier_revenue_cents
       FROM ticket_tiers 
       WHERE event_id = $1 
       ORDER BY price_cents ASC`,
      [id]
    );

    const tiersData = tiersResult.rows;
    let totalTicketsSold = 0;
    let totalRevenueCents = 0;
    const capacityByTier = [];
    const revenueByTier = [];

    for (const tier of tiersData) {
      totalTicketsSold += tier.sold_qty;
      totalRevenueCents += parseInt(tier.tier_revenue_cents);

      capacityByTier.push({
        id: tier.id,
        name: tier.name,
        total: tier.total_qty,
        sold: tier.sold_qty,
        remaining: tier.total_qty - tier.sold_qty,
        fillRate: tier.total_qty > 0 ? (tier.sold_qty / tier.total_qty) * 100 : 0
      });

      revenueByTier.push({
        name: tier.name,
        revenue: parseInt(tier.tier_revenue_cents) / 100, // Dollar value
        sold: tier.sold_qty
      });
    }

    // 4. Conversion Rate
    // If views are 0, use views = totalTicketsSold + 5 as a realistic fallback for demo, or just 0.
    // Let's compute actual: (totalTicketsSold / views) * 100, capped at 100
    const viewsDivider = views || totalTicketsSold || 1;
    const conversionRate = Math.min(((totalTicketsSold / viewsDivider) * 100), 100).toFixed(1);

    // 5. Tickets Sold Over Time
    // Grouping purchases by day or hour
    let timeSeriesQuery = '';
    if (timeGroup === 'hour') {
      timeSeriesQuery = `
        SELECT 
          to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') AS time_bucket, 
          COUNT(id) AS tickets_sold
        FROM tickets 
        WHERE event_id = $1 AND status != 'CANCELLED'
        GROUP BY date_trunc('hour', created_at)
        ORDER BY date_trunc('hour', created_at) ASC
      `;
    } else {
      timeSeriesQuery = `
        SELECT 
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS time_bucket, 
          COUNT(id) AS tickets_sold
        FROM tickets 
        WHERE event_id = $1 AND status != 'CANCELLED'
        GROUP BY date_trunc('day', created_at)
        ORDER BY date_trunc('day', created_at) ASC
      `;
    }

    const timeSeriesResult = await db.query(timeSeriesQuery, [id]);
    
    // We will accumulate tickets sold to show a running total if wanted,
    // or just return the snapshot per hour/day. Let's return both or just incremental sales.
    // Recharts can display sales per bucket. Let's add running cumulative sales too.
    let cumulative = 0;
    const salesOverTime = timeSeriesResult.rows.map(row => {
      cumulative += parseInt(row.tickets_sold);
      return {
        time: row.time_bucket,
        sales: parseInt(row.tickets_sold),
        cumulativeSales: cumulative
      };
    });

    return res.json({
      summary: {
        totalRevenue: totalRevenueCents / 100, // Dollar value
        totalTicketsSold,
        views: Math.max(views, totalTicketsSold), // Views should at least equal tickets sold
        conversionRate: parseFloat(conversionRate)
      },
      capacityByTier,
      revenueByTier,
      salesOverTime
    });

  } catch (error) {
    console.error('Analytics computation error:', error);
    return res.status(500).json({ error: 'Failed to compute analytics', code: 'INTERNAL_SERVER_ERROR' });
  }
});

module.exports = router;
