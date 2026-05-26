-- =========================================================
-- Support Desk
-- Database Schema Snapshot
-- =========================================================
-- This file documents the current public tables used by the
-- Support Desk.
--
-- Note:
-- This schema was reconstructed from column metadata.
-- Exact foreign keys, indexes, unique constraints, and triggers
-- should be exported separately later if needed.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- 1. CUSTOMERS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  full_name text,
  email_primary text,
  email_secondary text,
  phone_primary text,
  phone_secondary text,
  phone_primary_normalized text,
  phone_secondary_normalized text,
  shipping_address text,
  billing_address text,
  customer_notes text,
  source text DEFAULT 'manual'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- =========================================================
-- 2. TICKETS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL,
  customer_id uuid,
  order_id uuid,
  title text,
  description text,
  category text NOT NULL DEFAULT 'general'::text,
  status text NOT NULL DEFAULT 'new'::text,
  priority text NOT NULL DEFAULT 'normal'::text,
  source text NOT NULL DEFAULT 'manual'::text,
  assigned_agent_id uuid,
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,

  CONSTRAINT tickets_pkey PRIMARY KEY (id)
);

-- =========================================================
-- 3. COMMUNICATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.communications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid,
  customer_id uuid,
  order_id uuid,
  channel text NOT NULL,
  direction text,
  author_type text,
  author_name text,
  phone_number text,
  phone_number_normalized text,
  email_address text,
  subject text,
  message_body text,
  message_type text,
  external_id text,
  openphone_call_id text,
  openphone_message_id text,
  email_message_id text,
  call_type text,
  file_type text,
  recording_url text,
  transcript_url text,
  transcript_text text,
  summary text,
  raw_payload jsonb,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT communications_pkey PRIMARY KEY (id)
);

-- =========================================================
-- 4. ATTACHMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  communication_id uuid,
  ticket_id uuid,
  customer_id uuid,
  file_type text,
  file_name text,
  file_url text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  storage_bucket text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  external_id text,
  communication_channel text,

  CONSTRAINT attachments_pkey PRIMARY KEY (id)
);
