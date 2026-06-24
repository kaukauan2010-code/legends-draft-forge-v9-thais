ALTER TABLE public.partida_online
  ADD COLUMN IF NOT EXISTS log_eventos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS penaltis JSONB;