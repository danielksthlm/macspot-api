-- Lägg till saknade kolumner i event_log i molndatabasen
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_log' AND column_name='id') THEN
        ALTER TABLE event_log ADD COLUMN id uuid DEFAULT gen_random_uuid() PRIMARY KEY;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_log' AND column_name='table_name') THEN
        ALTER TABLE event_log ADD COLUMN table_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_log' AND column_name='record_id') THEN
        ALTER TABLE event_log ADD COLUMN record_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_log' AND column_name='action') THEN
        ALTER TABLE event_log ADD COLUMN action text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_log' AND column_name='timestamp') THEN
        ALTER TABLE event_log ADD COLUMN timestamp timestamp with time zone DEFAULT now();
    END IF;
END$$;