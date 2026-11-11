-- 0001: MRM Security Engine hash-chained audit ledger. Server-side access only (service-role key);
-- RLS on, no policies. Append-only by design: the app never updates or deletes, and each block's
-- hash covers its header plus the previous block's hash, so an out-of-band edit is detectable.
create table if not exists public.mrm_ledger (
  index         bigint primary key,           -- position in the chain; the PK makes concurrent appends race safely
  ts            timestamptz not null,
  actor         text not null,
  role          text not null,
  event         text not null,
  model_id      text not null,
  detail        jsonb not null default '{}'::jsonb,
  payload_hash  text not null,                -- SHA-256 of the canonical JSON of detail
  prev_hash     text not null,
  hash          text not null unique
);
create index if not exists mrm_ledger_model_idx on public.mrm_ledger (model_id, index desc);
alter table public.mrm_ledger enable row level security;
