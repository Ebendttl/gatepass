DROP INDEX IF EXISTS idx_tickets_tier_id;
DROP INDEX IF EXISTS idx_tickets_event_id_status;
DROP INDEX IF EXISTS idx_ticket_tiers_event_id;

DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS ticket_tiers;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;

DROP EXTENSION IF EXISTS "uuid-ossp";
