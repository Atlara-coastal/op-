-- Reliable exact-time daily reminders: pg_cron calls the Vercel endpoint
-- directly from the database instead of relying on an external scheduler
-- (GitHub Actions' schedule trigger can be delayed by hours).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;