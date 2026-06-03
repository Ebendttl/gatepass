const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const redisClient = require('../redis');
const emailQueue = require('../queue');
const { ACCESS_SECRET } = require('../auth');

// Initialize Stripe (handles mock key gracefully)
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_stripe_key';
const stripe = require('stripe')(stripeKey);

const router = express.Router();

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

// POST /api/checkout/intent - Create Stripe PaymentIntent (public, rate limited)
router.post('/intent', async (req, res) => {
  const { tier_id, qty, buyer_email, queue_token } = req.body;

  if (!tier_id || !qty || !buyer_email) {
    return res.status(400).json({ error: 'tier_id, qty, and buyer_email are required', code: 'BAD_REQUEST' });
  }

  if (qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than zero', code: 'BAD_REQUEST' });
  }

  try {
    // 1. Fetch Tier and Event details
    const tierResult = await db.query(
      `SELECT tt.*, e.title as event_title, e.status as event_status 
       FROM ticket_tiers tt
       JOIN events e ON tt.event_id = e.id
       WHERE tt.id = $1`,
      [tier_id]
    );

    if (tierResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket tier not found', code: 'TIER_NOT_FOUND' });
    }

    const tier = tierResult.rows[0];

    // Check if event is active
    if (tier.event_status !== 'active') {
      return res.status(400).json({ error: 'Event is cancelled or inactive', code: 'EVENT_INACTIVE' });
    }

    // 2. Queue System Check (for high-demand launches)
    // Check if event has a total capacity >= 1000 (which triggers the queue system)
    const totalEventCapacityResult = await db.query(
      'SELECT SUM(total_qty) as total_capacity FROM ticket_tiers WHERE event_id = $1',
      [tier.event_id]
    );
    const totalCapacity = parseInt(totalEventCapacityResult.rows[0].total_capacity || '0');

    if (totalCapacity >= 1000) {
      if (!queue_token) {
        return res.status(403).json({
          error: 'High-demand event. Queue position token is required.',
          code: 'QUEUE_TOKEN_REQUIRED'
        });
      }

      try {
        const decoded = jwt.verify(queue_token, ACCESS_SECRET);
        if (decoded.eventId !== tier.event_id) {
          return res.status(403).json({ error: 'Queue token is for a different event', code: 'INVALID_QUEUE_TOKEN' });
        }
        if (!decoded.activeUntil || Date.now() > decoded.activeUntil) {
          return res.status(403).json({ error: 'Queue purchase window has expired', code: 'QUEUE_TOKEN_EXPIRED' });
        }
      } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired queue token', code: 'INVALID_QUEUE_TOKEN' });
      }
    }

    // 3. Dry-run capacity check (exclusive locking occurs at confirmation webhook)
    if (tier.sold_qty + qty > tier.total_qty) {
      return res.status(400).json({ error: 'Not enough tickets remaining in this tier', code: 'TIER_FULL' });
    }

    const amountCents = tier.price_cents * qty;

    // 4. Create PaymentIntent
    // If Stripe secret is a mock, return a mock client secret
    let clientSecret = 'mock_client_secret_' + crypto.randomBytes(16).toString('hex');
    let paymentIntentId = 'pi_mock_' + crypto.randomBytes(16).toString('hex');

    if (!stripeKey.startsWith('sk_test_mock')) {
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: 'usd',
          receipt_email: buyer_email,
          metadata: {
            tier_id,
            qty: qty.toString(),
            buyer_email,
            event_id: tier.event_id
          }
        });
        clientSecret = paymentIntent.client_secret;
        paymentIntentId = paymentIntent.id;
      } catch (stripeErr) {
        console.error('Stripe PaymentIntent creation error:', stripeErr);
        return res.status(500).json({ error: 'Stripe payment initiation failed', code: 'STRIPE_ERROR' });
      }
    }

    return res.json({
      clientSecret,
      paymentIntentId,
      amountCents,
      isMock: stripeKey.startsWith('sk_test_mock')
    });

  } catch (error) {
    console.error('Checkout intent error:', error);
    return res.status(500).json({ error: 'Checkout initiation failed', code: 'INTERNAL_SERVER_ERROR' });
  }
});

// POST /api/checkout/confirm - Webhook Handler (Stripe or manual mock confirmation)
// Note: Requires raw body middleware in index.js to verify webhook signature
router.post('/confirm', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  let rawBody = req.body;

  // Convert buffer to string if necessary
  if (Buffer.isBuffer(rawBody)) {
    rawBody = rawBody.toString('utf8');
  }

  // 1. Signature Verification
  const isMockStripe = stripeKey.startsWith('sk_test_mock') || !sig;

  if (isMockStripe) {
    // Development / test fallback bypass
    try {
      const parsed = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      // Normalizes mock payload to mimic Stripe webhook format
      if (parsed.type === 'payment_intent.succeeded') {
        event = parsed;
      } else {
        // Direct testing/manual confirmation mock wrapper
        event = {
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: parsed.id || parsed.paymentIntentId || 'pi_mock_direct',
              metadata: parsed.metadata || {
                tier_id: parsed.tier_id,
                qty: parsed.qty ? parsed.qty.toString() : '1',
                buyer_email: parsed.buyer_email,
                event_id: parsed.event_id
              }
            }
          }
        };
      }
    } catch (parseErr) {
      return res.status(400).json({ error: 'Invalid json body', code: 'BAD_REQUEST' });
    }
  } else {
    // Real Stripe webhook signature verification
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err) {
      console.error(`Webhook Signature verification failed: ${err.message}`);
      return res.status(400).json({ error: `Webhook Error: ${err.message}`, code: 'WEBHOOK_SIGNATURE_FAILED' });
    }
  }

  // 2. Handle Payment Success
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const { tier_id, qty, buyer_email, event_id } = paymentIntent.metadata;
    const quantity = parseInt(qty);

    if (!tier_id || !quantity || !buyer_email) {
      return res.status(400).json({ error: 'Missing payment intent metadata', code: 'METADATA_MISSING' });
    }

    // 3. DATABASE TRANSACTION WITH EXCLUSIVE ROW-LEVEL LOCKING
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // 3.1 Lock the ticket tier row exclusively
      // Explain in comments: FOR UPDATE places an exclusive row-level lock. 
      // Any concurrent transactions attempting to read/write this row will wait until this transaction COMMITs or ROLLBACKs.
      // This guarantees no other request can read a stale sold_qty.
      const tierResult = await client.query(
        'SELECT id, name, price_cents, total_qty, sold_qty FROM ticket_tiers WHERE id = $1 FOR UPDATE',
        [tier_id]
      );

      if (tierResult.rows.length === 0) {
        throw new Error('TIER_NOT_FOUND');
      }

      const tier = tierResult.rows[0];

      // 3.2 Verify remaining capacity
      // Explain in comments: Checks capacity inside the lock. If exceeded, throws error to trigger rollback.
      if (tier.sold_qty + quantity > tier.total_qty) {
        throw new Error('TIER_FULL');
      }

      // 3.3 Update capacity
      // Explain in comments: Increments sold_qty safely inside the transaction.
      await client.query(
        'UPDATE ticket_tiers SET sold_qty = sold_qty + $1 WHERE id = $2',
        [quantity, tier_id]
      );

      // 3.4 Fetch Event details for email purposes
      const eventResult = await client.query(
        'SELECT title, start_at, location FROM events WHERE id = $1',
        [event_id]
      );
      const eventDetails = eventResult.rows[0] || { title: 'Event', start_at: new Date(), location: 'Location' };

      // 3.5 Create ticket rows atomically and generate HMAC payload
      const createdTickets = [];
      for (let i = 0; i < quantity; i++) {
        const ticketId = crypto.randomUUID();
        const qrPayload = generateSignedQrPayload(ticketId, event_id, tier_id);

        const ticketInsertResult = await client.query(
          `INSERT INTO tickets (id, event_id, tier_id, buyer_email, qr_payload, status) 
           VALUES ($1, $2, $3, $4, $5, 'UNUSED') RETURNING *`,
          [ticketId, event_id, tier_id, buyer_email, qrPayload]
        );

        createdTickets.push(ticketInsertResult.rows[0]);

        // 4. Enqueue Email Job to Bull Queue
        // Enqueue asynchronously so the Stripe webhook response completes instantly and doesn't block.
        await emailQueue.add({
          buyer_email,
          event_title: eventDetails.title,
          event_start_at: eventDetails.start_at,
          event_location: eventDetails.location,
          ticket_id: ticketId,
          qr_payload: qrPayload,
          tier_name: tier.name
        });
      }

      await client.query('COMMIT');
      console.log(`[Checkout] Transaction successful. ${quantity} tickets created for ${buyer_email}`);
      return res.json({ success: true, ticketsCount: createdTickets.length, tickets: createdTickets });

    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('[Checkout] Transaction aborted and rolled back:', txErr.message);

      if (txErr.message === 'TIER_NOT_FOUND' || txErr.message === 'TIER_FULL') {
        return res.status(409).json({ error: 'Selected tier is sold out or unavailable', code: txErr.message });
      }

      return res.status(500).json({ error: 'Transaction processing failed', code: 'TRANSACTION_FAILED' });
    } finally {
      client.release();
    }
  }

  // Accept other event types without error
  return res.json({ received: true });
});

module.exports = router;
