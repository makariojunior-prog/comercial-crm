-- Create custom types for Status and Priority
DO $$ BEGIN
    CREATE TYPE deal_status AS ENUM ('NOVO', 'EM ANDAMENTO', 'SUCESSO', 'DESISTIU', 'CANCELADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE deal_priority AS ENUM ('BAIXA', 'MÉDIA', 'ALTA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create DEALS table
CREATE TABLE IF NOT EXISTS public.deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_date DATE DEFAULT CURRENT_DATE,
    client_name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    deal_type TEXT, -- LUMAR, CANTINA REVENDA, etc
    responsible TEXT,
    interest TEXT,
    last_contact_date DATE DEFAULT CURRENT_DATE,
    status deal_status DEFAULT 'NOVO',
    priority deal_priority DEFAULT 'MÉDIA',
    follow_up TEXT,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create VISITS table
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_date DATE DEFAULT CURRENT_DATE,
    visit_type TEXT, -- Prospecção, etc
    client_name TEXT NOT NULL,
    responsible TEXT,
    demand TEXT,
    report TEXT,
    priority TEXT,
    status TEXT DEFAULT 'Realizada',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

-- Simple policy to allow all actions for now (Refine later with Auth)
CREATE POLICY "Allow all actions for now" ON public.deals FOR ALL USING (true);
CREATE POLICY "Allow all actions for now" ON public.visits FOR ALL USING (true);
