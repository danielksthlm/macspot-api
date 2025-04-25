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
-- Name: contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact (
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_email text
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
-- Name: idx_contact_booking_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_booking_email ON public.contact USING btree (booking_email);


--
-- Name: idx_contact_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_language ON public.contact USING btree (((metadata ->> 'language'::text)));


--
-- Name: idx_event_log_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_log_received_at ON public.event_log USING btree (received_at);


--
-- Name: idx_translation_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_translation_key ON public.translation USING btree (key);


--
-- Name: bookings trigger_log_bookings_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_bookings_change AFTER INSERT OR DELETE OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.log_bookings_change();


--
-- Name: contact trigger_log_contact_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_contact_change AFTER INSERT OR DELETE OR UPDATE ON public.contact FOR EACH ROW EXECUTE FUNCTION public.log_contact_change();


--
-- Name: event_log trigger_log_event_log_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_event_log_change AFTER INSERT OR DELETE OR UPDATE ON public.event_log FOR EACH ROW EXECUTE FUNCTION public.log_event_log_change();


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
-- PostgreSQL database dump complete
--

