DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'contact' AND column_name = 'email'
  ) THEN
    ALTER TABLE contact ADD COLUMN email TEXT;
  END IF;
END $$;