CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('DRIVER', 'ADMIN');
CREATE TYPE device_status AS ENUM ('ACTIVE', 'DISABLED', 'LOST');
CREATE TYPE session_status AS ENUM ('ACTIVE', 'COMPLETED', 'ABORTED');
CREATE TYPE event_level AS ENUM ('WARNING', 'CRITICAL');
CREATE TYPE alert_channel AS ENUM ('GLASSES', 'BUZZER', 'DASHBOARD', 'MOBILE');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'DRIVER',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  serial_number text NOT NULL UNIQUE,
  name text NOT NULL,
  status device_status NOT NULL DEFAULT 'ACTIVE',
  api_key_hash text NOT NULL,
  firmware_version text,
  battery_percent smallint CHECK (battery_percent BETWEEN 0 AND 100),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE driving_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id),
  status session_status NOT NULL DEFAULT 'ACTIVE',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_lat numeric(9,6),
  start_lon numeric(9,6),
  end_lat numeric(9,6),
  end_lon numeric(9,6),
  CONSTRAINT valid_session_time CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX one_active_session_per_device
  ON driving_sessions(device_id) WHERE status = 'ACTIVE';

CREATE TABLE telemetry_samples (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES driving_sessions(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id),
  sequence_number bigint NOT NULL,
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  eye_aspect_ratio numeric(5,4) CHECK (eye_aspect_ratio BETWEEN 0 AND 2),
  eye_closed_ms integer CHECK (eye_closed_ms >= 0),
  blink_rate numeric(6,2) CHECK (blink_rate >= 0),
  head_pitch numeric(6,2),
  head_roll numeric(6,2),
  confidence numeric(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  drowsiness_score numeric(5,4) NOT NULL CHECK (drowsiness_score BETWEEN 0 AND 1),
  UNIQUE (device_id, sequence_number)
);

CREATE INDEX telemetry_session_time_idx ON telemetry_samples(session_id, captured_at DESC);

CREATE TABLE drowsiness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES driving_sessions(id) ON DELETE CASCADE,
  telemetry_id bigint REFERENCES telemetry_samples(id),
  level event_level NOT NULL,
  score numeric(5,4) NOT NULL CHECK (score BETWEEN 0 AND 1),
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_session_time_idx ON drowsiness_events(session_id, occurred_at DESC);

CREATE TABLE alert_deliveries (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES drowsiness_events(id) ON DELETE CASCADE,
  channel alert_channel NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  failure_reason text,
  UNIQUE(event_id, channel)
);

CREATE TABLE schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
