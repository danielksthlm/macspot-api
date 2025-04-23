--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17 (Homebrew)
-- Dumped by pg_dump version 14.17 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled'
);


--
-- Name: get_booking_setting(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_booking_setting(key text) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT value ->> ''
  FROM booking_settings
  WHERE booking_settings.key = get_booking_setting.key;
$$;


--
-- Name: log_contact_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_contact_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO pending_changes (table_name, record_id, operation, payload, created_at, change_type, direction)
    VALUES (
      'contact',
      OLD.id,
      'DELETE',
      row_to_json(OLD),
      now(),
      'local',
      'out'
    );
  ELSE
    INSERT INTO pending_changes (table_name, record_id, operation, payload, created_at, change_type, direction)
    VALUES (
      'contact',
      NEW.id,
      TG_OP,
      row_to_json(NEW),
      now(),
      'local',
      'out'
    );
  END IF;
  RETURN NULL;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: booking_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    value_type text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    meeting_type text NOT NULL,
    location_type text DEFAULT 'online'::text,
    address text,
    postal_code text,
    city text,
    country text DEFAULT 'SE'::text,
    participant_count integer DEFAULT 1,
    meeting_link text,
    status public.booking_status DEFAULT 'confirmed'::public.booking_status,
    require_approval boolean DEFAULT false,
    language text DEFAULT 'sv'::text,
    synced_to_calendar boolean DEFAULT false,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    contact_id uuid,
    event_id uuid,
    room_email text,
    id uuid NOT NULL,
    CONSTRAINT bookings_location_type_check CHECK ((location_type = ANY (ARRAY['online'::text, 'onsite'::text, 'facetime'::text]))),
    CONSTRAINT bookings_participant_count_check CHECK ((participant_count > 0))
);


--
-- Name: ccrelation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ccrelation (
    contact_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role text NOT NULL,
    main_contact boolean DEFAULT false,
    start_date date,
    end_date date,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    id uuid NOT NULL
);


--
-- Name: company; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company (
    name text NOT NULL,
    org_number text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    id uuid NOT NULL
);


--
-- Name: contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact (
    first_name text,
    last_name text,
    phone text,
    language text DEFAULT 'sv'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text
);


--
-- Name: contact_email; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_email (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    email text NOT NULL,
    is_primary boolean DEFAULT false,
    label text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_log (
    source text,
    event_type text,
    payload jsonb,
    received_at timestamp with time zone DEFAULT now(),
    id uuid NOT NULL
);


--
-- Name: pending_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    change_type text NOT NULL,
    direction text NOT NULL,
    processed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    operation text,
    payload jsonb
);


--
-- Name: translation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.translation (
    key character varying(255) NOT NULL,
    sv text,
    en text
);


--
-- Name: booking_settings booking_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_settings
    ADD CONSTRAINT booking_settings_pkey PRIMARY KEY (key);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: ccrelation ccrelation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT ccrelation_pkey PRIMARY KEY (id);


--
-- Name: company company_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (id);


--
-- Name: contact_email contact_email_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_email
    ADD CONSTRAINT contact_email_pkey PRIMARY KEY (id);


--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- Name: event_log event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


--
-- Name: pending_changes pending_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_changes
    ADD CONSTRAINT pending_changes_pkey PRIMARY KEY (id);


--
-- Name: translation translation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.translation
    ADD CONSTRAINT translation_pkey PRIMARY KEY (key);


--
-- Name: translation unique_translation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.translation
    ADD CONSTRAINT unique_translation_key UNIQUE (key);


--
-- Name: idx_bookings_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_start_time ON public.bookings USING btree (start_time);


--
-- Name: idx_ccrelation_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccrelation_role ON public.ccrelation USING btree (role);


--
-- Name: idx_company_org_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_company_org_number ON public.company USING btree (org_number);


--
-- Name: idx_contact_email_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_email_contact_id ON public.contact_email USING btree (contact_id);


--
-- Name: idx_contact_email_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_email_email ON public.contact_email USING btree (email);


--
-- Name: idx_contact_first_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_first_name ON public.contact USING btree (first_name);


--
-- Name: idx_contact_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_phone ON public.contact USING btree (phone);


--
-- Name: idx_event_log_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_log_received_at ON public.event_log USING btree (received_at);


--
-- Name: idx_translation_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_translation_key ON public.translation USING btree (key);


--
-- Name: contact trigger_log_contact_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_contact_change AFTER INSERT OR DELETE OR UPDATE ON public.contact FOR EACH ROW EXECUTE FUNCTION public.log_contact_change();


--
-- Name: contact_email contact_email_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_email
    ADD CONSTRAINT contact_email_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: bookings fk_bookings_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_contact_id FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE SET NULL;


--
-- Name: bookings fk_bookings_event_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_event_id FOREIGN KEY (event_id) REFERENCES public.event_log(id) ON DELETE SET NULL;


--
-- Name: ccrelation fk_ccrelation_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT fk_ccrelation_company_id FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;


--
-- Name: ccrelation fk_ccrelation_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT fk_ccrelation_contact_id FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

