DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_settings' AND column_name = 'key'
  ) THEN
    CREATE TABLE booking_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      value_type TEXT
    );
  END IF;
END $$;