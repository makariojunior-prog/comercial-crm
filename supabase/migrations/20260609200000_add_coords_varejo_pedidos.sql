-- Add geolocation columns to varejo_pedidos
ALTER TABLE varejo_pedidos
  ADD COLUMN IF NOT EXISTS lat float8,
  ADD COLUMN IF NOT EXISTS lng float8,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

-- Create index for faster map queries
CREATE INDEX IF NOT EXISTS idx_varejo_pedidos_coords ON varejo_pedidos(data_entrega, lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
