DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'pending_changes' AND column_name = 'booking_id'
  ) THEN
    ALTER TABLE pending_changes ADD COLUMN booking_id UUID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'pending_changes' AND constraint_name = 'fk_pending_changes_booking_id'
  ) THEN
    ALTER TABLE pending_changes
    ADD CONSTRAINT fk_pending_changes_booking_id
    FOREIGN KEY (booking_id)
    REFERENCES bookings(id)
    ON DELETE CASCADE;
  END IF;
END $$;