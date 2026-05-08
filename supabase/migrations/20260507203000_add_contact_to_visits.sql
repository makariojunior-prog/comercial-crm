-- Add contact fields to visits table
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS contact_phone TEXT;
