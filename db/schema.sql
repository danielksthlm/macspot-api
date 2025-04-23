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
-- Name: booking_status; Type: TYPE; Schema: public; Owner: danielkallberg
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled'
);


ALTER TYPE public.booking_status OWNER TO danielkallberg;

--
-- Name: get_booking_setting(text); Type: FUNCTION; Schema: public; Owner: danielkallberg
--

CREATE FUNCTION public.get_booking_setting(key text) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT value ->> ''
  FROM booking_settings
  WHERE booking_settings.key = get_booking_setting.key;
$$;


ALTER FUNCTION public.get_booking_setting(key text) OWNER TO danielkallberg;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: booking_settings; Type: TABLE; Schema: public; Owner: danielkallberg
--

CREATE TABLE public.booking_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    value_type text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.booking_settings OWNER TO danielkallberg;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: danielkallberg
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


ALTER TABLE public.bookings OWNER TO danielkallberg;

--
-- Name: ccrelation; Type: TABLE; Schema: public; Owner: danielkallberg
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


ALTER TABLE public.ccrelation OWNER TO danielkallberg;

--
-- Name: company; Type: TABLE; Schema: public; Owner: danielkallberg
--

CREATE TABLE public.company (
    name text NOT NULL,
    org_number text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    id uuid NOT NULL
);


ALTER TABLE public.company OWNER TO danielkallberg;

--
-- Name: contact; Type: TABLE; Schema: public; Owner: danielkallberg
--

CREATE TABLE public.contact (
    first_name text,
    last_name text,
    phone text,
    language text DEFAULT 'sv'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


ALTER TABLE public.contact OWNER TO danielkallberg;

--
-- Name: contact_email; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contact_email (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    email text NOT NULL,
    is_primary boolean DEFAULT false,
    label text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.contact_email OWNER TO postgres;

--
-- Name: event_log; Type: TABLE; Schema: public; Owner: danielkallberg
--

CREATE TABLE public.event_log (
    source text,
    event_type text,
    payload jsonb,
    received_at timestamp with time zone DEFAULT now(),
    id uuid NOT NULL
);


ALTER TABLE public.event_log OWNER TO danielkallberg;

--
-- Name: translation; Type: TABLE; Schema: public; Owner: danielkallberg
--

CREATE TABLE public.translation (
    key character varying(255) NOT NULL,
    sv text,
    en text
);


ALTER TABLE public.translation OWNER TO danielkallberg;

--
-- Name: booking_settings booking_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.booking_settings
    ADD CONSTRAINT booking_settings_pkey PRIMARY KEY (key);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: ccrelation ccrelation_pkey; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT ccrelation_pkey PRIMARY KEY (id);


--
-- Name: company company_pkey; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (id);


--
-- Name: contact_email contact_email_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_email
    ADD CONSTRAINT contact_email_pkey PRIMARY KEY (id);


--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- Name: event_log event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


--
-- Name: translation translation_pkey; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.translation
    ADD CONSTRAINT translation_pkey PRIMARY KEY (key);


--
-- Name: translation unique_translation_key; Type: CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.translation
    ADD CONSTRAINT unique_translation_key UNIQUE (key);


--
-- Name: idx_bookings_start_time; Type: INDEX; Schema: public; Owner: danielkallberg
--

CREATE INDEX idx_bookings_start_time ON public.bookings USING btree (start_time);


--
-- Name: idx_ccrelation_role; Type: INDEX; Schema: public; Owner: danielkallberg
--

CREATE INDEX idx_ccrelation_role ON public.ccrelation USING btree (role);


--
-- Name: idx_company_org_number; Type: INDEX; Schema: public; Owner: danielkallberg
--

CREATE UNIQUE INDEX idx_company_org_number ON public.company USING btree (org_number);


--
-- Name: idx_contact_email_contact_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_email_contact_id ON public.contact_email USING btree (contact_id);


--
-- Name: idx_contact_email_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contact_email_email ON public.contact_email USING btree (email);


--
-- Name: idx_contact_first_name; Type: INDEX; Schema: public; Owner: danielkallberg
--

CREATE INDEX idx_contact_first_name ON public.contact USING btree (first_name);


--
-- Name: idx_contact_phone; Type: INDEX; Schema: public; Owner: danielkallberg
--

CREATE INDEX idx_contact_phone ON public.contact USING btree (phone);


--
-- Name: idx_event_log_received_at; Type: INDEX; Schema: public; Owner: danielkallberg
--

CREATE INDEX idx_event_log_received_at ON public.event_log USING btree (received_at);


--
-- Name: idx_translation_key; Type: INDEX; Schema: public; Owner: danielkallberg
--

CREATE UNIQUE INDEX idx_translation_key ON public.translation USING btree (key);


--
-- Name: contact_email contact_email_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contact_email
    ADD CONSTRAINT contact_email_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: bookings fk_bookings_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_contact_id FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE SET NULL;


--
-- Name: bookings fk_bookings_event_id; Type: FK CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT fk_bookings_event_id FOREIGN KEY (event_id) REFERENCES public.event_log(id) ON DELETE SET NULL;


--
-- Name: ccrelation fk_ccrelation_company_id; Type: FK CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT fk_ccrelation_company_id FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;


--
-- Name: ccrelation fk_ccrelation_contact_id; Type: FK CONSTRAINT; Schema: public; Owner: danielkallberg
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT fk_ccrelation_contact_id FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: danielkallberg
--

GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

