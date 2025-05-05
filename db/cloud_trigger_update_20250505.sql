-- Uppdaterar triggerfunktioner i molndatabasen (contact + bookings)
-- Datum: 20250505

-- Steg 1: Lägg till updated_at-kolumn om den saknas
ALTER TABLE contact ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Steg 2: Funktion för contact
CREATE OR REPLACE FUNCTION log_contact_change()
RETURNS trigger AS $$
BEGIN
  INSERT INTO event_log (table_name, record_id, action, timestamp)
  VALUES ('contact', COALESCE(NEW.id, OLD.id), TG_OP, now());

  IF TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := now();
  END IF;

  INSERT INTO pending_changes (
    table_name, record_id, change_type, direction, processed,
    created_at, operation, payload
  )
  VALUES (
    'contact',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    'in',
    false,
    now(),
    TG_OP,
    CASE 
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Steg 3: Funktion för bookings
CREATE OR REPLACE FUNCTION log_bookings_change()
RETURNS trigger AS $$
BEGIN
  INSERT INTO event_log (table_name, record_id, action, timestamp)
  VALUES ('bookings', COALESCE(NEW.id, OLD.id), TG_OP, now());

  IF TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := now();
  END IF;

  INSERT INTO pending_changes (
    table_name, record_id, change_type, direction, processed,
    created_at, operation, payload
  )
  VALUES (
    'bookings',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    'in',
    false,
    now(),
    TG_OP,
    CASE 
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
