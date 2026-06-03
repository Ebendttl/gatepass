const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken, requireStaffOrOrganizer } = require('../auth');

const router = express.Router();

// Helper to verify the HMAC QR Payload signature
function verifyQrPayload(payloadStr) {
  try {
    const payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    const { ticket_id, event_id, tier_id, hmac_signature } = payload;
    
    if (!ticket_id || !event_id || !tier_id || !hmac_signature) {
      return null;
    }

    const secret = process.env.HMAC_QR_SECRET || 'default_hmac_secret';
    const data = `${ticket_id}:${event_id}:${tier_id}`;
    
    const expectedHmac = crypto.createHmac('sha256', secret).update(data).digest('hex');
    
    if (expectedHmac === hmac_signature) {
      return payload;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// POST /api/tickets/scan - Scan and validate ticket (requires staff/organizer privileges)
router.post('/scan', authenticateToken, requireStaffOrOrganizer, async (req, res) => {
  const { qr_payload } = req.body;

  if (!qr_payload) {
    return res.status(400).json({ error: 'QR code payload is required', code: 'BAD_REQUEST' });
  }

  // 1. Decode QR and Verify HMAC
  const ticketInfo = verifyQrPayload(qr_payload);
  if (!ticketInfo) {
    return res.status(400).json({
      valid: false,
      message: '✗ Fake ticket (Signature mismatch)',
      code: 'INVALID_SIGNATURE'
    });
  }

  const { ticket_id } = ticketInfo;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Lock the ticket row exclusively to prevent race conditions during scanning
    const ticketResult = await client.query(
      `SELECT t.*, e.title as event_title, tt.name as tier_name 
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       JOIN ticket_tiers tt ON t.tier_id = tt.id
       WHERE t.id = $1 FOR UPDATE`,
      [ticket_id]
    );

    if (ticketResult.rows.length === 0) {
      await client.query('COMMIT');
      return res.status(404).json({
        valid: false,
        message: '✗ Ticket not found in database',
        code: 'TICKET_NOT_FOUND'
      });
    }

    const ticket = ticketResult.rows[0];

    // 3. Check status
    if (ticket.status === 'CANCELLED') {
      await client.query('COMMIT');
      return res.json({
        valid: false,
        message: '✗ Ticket has been CANCELLED',
        code: 'TICKET_CANCELLED',
        ticketDetails: {
          buyerEmail: ticket.buyer_email,
          eventTitle: ticket.event_title,
          tierName: ticket.tier_name
        }
      });
    }

    if (ticket.status === 'USED') {
      await client.query('COMMIT');
      const scannedTime = new Date(ticket.scanned_at).toLocaleString();
      return res.json({
        valid: false,
        message: `✗ Already scanned at ${scannedTime}`,
        code: 'TICKET_ALREADY_USED',
        scannedAt: ticket.scanned_at,
        ticketDetails: {
          buyerEmail: ticket.buyer_email,
          eventTitle: ticket.event_title,
          tierName: ticket.tier_name
        }
      });
    }

    // If status is UNUSED, mark it USED and set scanned_at timestamp
    const updateResult = await client.query(
      `UPDATE tickets 
       SET status = 'USED', scanned_at = NOW(), updated_at = NOW() 
       WHERE id = $1 RETURNING *`,
      [ticket_id]
    );

    await client.query('COMMIT');

    return res.json({
      valid: true,
      message: '✓ Valid ticket!',
      code: 'TICKET_VALIDATED',
      ticketDetails: {
        ticketId: ticket.id,
        buyerEmail: ticket.buyer_email,
        eventTitle: ticket.event_title,
        tierName: ticket.tier_name,
        scannedAt: updateResult.rows[0].scanned_at
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Scan ticket error:', err);
    return res.status(500).json({ error: 'Failed to process ticket scan', code: 'INTERNAL_SERVER_ERROR' });
  } finally {
    client.release();
  }
});

// GET /api/tickets/buyer - Get tickets for a specific buyer email (public helper)
router.get('/buyer', async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Buyer email is required', code: 'BAD_REQUEST' });
  }

  try {
    const result = await db.query(
      `SELECT t.*, e.title as event_title, e.start_at, e.location, tt.name as tier_name
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       JOIN ticket_tiers tt ON t.tier_id = tt.id
       WHERE LOWER(t.buyer_email) = $1
       ORDER BY t.created_at DESC`,
      [email.toLowerCase().trim()]
    );
    return res.json({ tickets: result.rows });
  } catch (error) {
    console.error('Fetch buyer tickets error:', error);
    return res.status(500).json({ error: 'Failed to retrieve tickets', code: 'INTERNAL_SERVER_ERROR' });
  }
});

module.exports = router;
