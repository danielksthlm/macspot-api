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



--



SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: booking_settings; Type: TABLE; Schema: public;
--

CREATE TABLE public.booking_settings (
    key text NOT NULL,
    value jsonb,
    value_type text,
    description text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT system_settings_value_type_check CHECK ((value_type = ANY (ARRAY['int'::text, 'string'::text, 'bool'::text, 'array'::text, 'json'::text, 'time'::text])))
);


--
-- Name: booking_settings_view; Type: VIEW; Schema: public;
--

CREATE VIEW public.booking_settings_view AS
 SELECT booking_settings.key,
    booking_settings.value_type,
    booking_settings.description,
    booking_settings.updated_at,
        CASE
            WHEN (booking_settings.value_type = 'string'::text) THEN (booking_settings.value ->> ''::text)
            WHEN (booking_settings.value_type = 'int'::text) THEN (booking_settings.value ->> ''::text)
            WHEN (booking_settings.value_type = 'bool'::text) THEN (booking_settings.value ->> ''::text)
            WHEN (booking_settings.value_type = 'time'::text) THEN (booking_settings.value ->> ''::text)
            ELSE (booking_settings.value)::text
        END AS parsed_value
   FROM public.booking_settings;


--
-- Name: bookings; Type: TABLE; Schema: public;
--

CREATE TABLE public.bookings (
    id uuid NOT NULL,
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
    event_id text,
    room_email text,
    CONSTRAINT bookings_location_type_check CHECK ((location_type = ANY (ARRAY['online'::text, 'onsite'::text, 'facetime'::text]))),
    CONSTRAINT bookings_participant_count_check CHECK ((participant_count > 0))
);


--
-- Name: ccrelation; Type: TABLE; Schema: public;
--

CREATE TABLE public.ccrelation (
    id uuid NOT NULL,
    contact_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role text NOT NULL,
    main_contact boolean DEFAULT false,
    start_date date,
    end_date date,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: company; Type: TABLE; Schema: public;
--

CREATE TABLE public.company (
    id uuid NOT NULL,
    name text NOT NULL,
    org_number text,
    email text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: contact; Type: TABLE; Schema: public;
--

CREATE TABLE public.contact (
    id uuid NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    phone text,
    language text DEFAULT 'sv'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_log; Type: TABLE; Schema: public;
--

CREATE TABLE public.event_log (
    id uuid NOT NULL,
    source text,
    event_type text,
    payload jsonb,
    received_at timestamp with time zone DEFAULT now()
);


--



--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: ccrelation ccrelation_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT ccrelation_pkey PRIMARY KEY (id);


--
-- Name: company company_email_key; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_email_key UNIQUE (email);


--
-- Name: company company_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.company
    ADD CONSTRAINT company_pkey PRIMARY KEY (id);


--
-- Name: contact contact_email_key; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_email_key UNIQUE (email);


--
-- Name: contact contact_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.contact
    ADD CONSTRAINT contact_pkey PRIMARY KEY (id);


--
-- Name: event_log event_log_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


--
-- Name: booking_settings system_settings_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.booking_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--



--
-- Name: idx_bookings_start_time; Type: INDEX; Schema: public;
--

CREATE INDEX idx_bookings_start_time ON public.bookings USING btree (start_time);


--
-- Name: bookings bookings_contact_id_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id);


--
-- Name: ccrelation ccrelation_company_id_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT ccrelation_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE;


--
-- Name: ccrelation ccrelation_contact_id_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.ccrelation
    ADD CONSTRAINT ccrelation_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contact(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--
