const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: true, // Allow all origins for local testing
  credentials: true,
}));

// Logger middleware
app.use(morgan('dev'));

// Zero-dependency HTTP-only cookie parser middleware
app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie || '';
  req.cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length === 2) {
      req.cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
    }
  });
  next();
});

// Routing imports
const authRouter = require('./routes/auth');
const eventsRouter = require('./routes/events');
const ticketsRouter = require('./routes/tickets');
const queueRouter = require('./routes/queue');
const checkoutRouter = require('./routes/checkout');

// Conditional parser middleware: Stripe webhook (/confirm) must read raw bytes for signature checks.
// Other endpoints can be parsed as JSON.
app.use('/api/checkout', (req, res, next) => {
  if (req.path === '/confirm') {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
}, checkoutRouter);

// Set up standard JSON parser for all other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Set up rate limiters (100 req/min per IP on checkout endpoint)
const rateLimit = require('express-rate-limit');
let checkoutLimiter;

try {
  const RedisStore = require('rate-limit-redis').default || require('rate-limit-redis');
  const redisClient = require('./redis');
  
  checkoutLimiter = rateLimit({
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many checkout requests from this IP, please try again after a minute',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  });
} catch (err) {
  console.warn('[Rate Limit] Falling back to MemoryStore:', err.message);
  checkoutLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many checkout requests from this IP, please try again after a minute',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  });
}

// Apply rate limiting specifically to intent creations
app.use('/api/checkout/intent', checkoutLimiter);

// Mount API Routers
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/queue', queueRouter);

// Global Error Handler for JSON parsing or routing failures
app.use((err, req, res, next) => {
  console.error('[Global Error Handler]:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected error occurred',
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

// Basic Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Gatepass Express API running on port ${PORT}`);
  console.log(`==================================================`);
});
