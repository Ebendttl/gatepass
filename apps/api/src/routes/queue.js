const express = require('express');
const jwt = require('jsonwebtoken');
const redisClient = require('../redis');
const { ACCESS_SECRET } = require('../auth');

const router = express.Router();

// Threshold of concurrent active buyers processed at one time
const QUEUE_THRESHOLD = 5; 

// POST /api/queue/join - Join the queue for an event
router.post('/join', async (req, res) => {
  const { event_id, email } = req.body;

  if (!event_id || !email) {
    return res.status(400).json({ error: 'event_id and email are required', code: 'BAD_REQUEST' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const queueKey = `queue:event:${event_id}`;

  try {
    const timestamp = Date.now();

    // 1. Enqueue user into Redis sorted set (score = timestamp)
    // ZADD returns 1 if element is new, 0 if already exists. Either way, score is updated or kept.
    // In redis v4, we use redisClient.zAdd
    await redisClient.zAdd(queueKey, {
      score: timestamp,
      value: cleanEmail
    });

    // 2. Fetch user's rank (0-indexed position)
    const rank = await redisClient.zRank(queueKey, cleanEmail);
    const position = rank !== null ? rank + 1 : 1;

    // 3. Issue queue position token (JWT)
    const queueToken = jwt.sign(
      { eventId: event_id, email: cleanEmail, timestamp },
      ACCESS_SECRET,
      { expiresIn: '1h' } // Token valid for 1 hour to poll
    );

    return res.json({
      queueToken,
      position,
      threshold: QUEUE_THRESHOLD,
      message: `Enqueued successfully. You are #${position} in line.`
    });

  } catch (error) {
    console.error('Queue join error:', error);
    return res.status(500).json({ error: 'Failed to join queue', code: 'INTERNAL_SERVER_ERROR' });
  }
});

// GET /api/queue/status/:token - Poll queue position and check if purchase window is open
router.get('/status/:token', async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ error: 'Queue token is required', code: 'BAD_REQUEST' });
  }

  try {
    // 1. Verify queue token
    const decoded = jwt.verify(token, ACCESS_SECRET);
    const { eventId, email } = decoded;
    const queueKey = `queue:event:${eventId}`;

    // 2. Get current rank in Redis sorted set
    const rank = await redisClient.zRank(queueKey, email);

    // If they aren't in the queue anymore, check if they were already processed
    if (rank === null) {
      // Grant a purchase bypass token anyway (assuming they passed the queue already)
      const purchaseToken = jwt.sign(
        { eventId, email, activeUntil: Date.now() + 5 * 60 * 1000 },
        ACCESS_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        status: 'active',
        position: 0,
        purchaseToken,
        message: 'Your purchase window is open! You have 5 minutes to checkout.'
      });
    }

    const position = rank + 1;

    // 3. If position is within the threshold, grant purchase window token
    if (position <= QUEUE_THRESHOLD) {
      // Remove from queue sorted set since they are being granted access
      await redisClient.zRem(queueKey, email);

      // Issue 5-minute purchase window token
      const purchaseToken = jwt.sign(
        { eventId, email, activeUntil: Date.now() + 5 * 60 * 1000 },
        ACCESS_SECRET,
        { expiresIn: '5m' }
      );

      return res.json({
        status: 'active',
        position: 0,
        purchaseToken,
        message: 'Your purchase window is open! You have 5 minutes to checkout.'
      });
    }

    // 4. Otherwise, return current position
    const totalQueue = await redisClient.zCard(queueKey);

    return res.json({
      status: 'waiting',
      position,
      totalQueue,
      message: `You are #${position} of ${totalQueue} in line. Please wait.`
    });

  } catch (error) {
    console.error('Queue status verification error:', error);
    return res.status(403).json({ error: 'Invalid or expired queue token', code: 'INVALID_QUEUE_TOKEN' });
  }
});

module.exports = router;
