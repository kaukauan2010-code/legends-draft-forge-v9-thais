
-- partida_online: permitir CPUs (NULL em jogadorN_id) e marcar encerramento
ALTER TABLE public.partida_online ALTER COLUMN jogador1_id DROP NOT NULL;
ALTER TABLE public.partida_online ALTER COLUMN jogador2_id DROP NOT NULL;
ALTER TABLE public.partida_online DROP CONSTRAINT IF EXISTS partida_online_check;
ALTER TABLE public.partida_online
  ADD COLUMN IF NOT EXISTS encerrada boolean NOT NULL DEFAULT true;

-- salas: tipo de draft + formação padrão para timeout
ALTER TABLE public.salas
  ADD COLUMN IF NOT EXISTS tipo_draft text NOT NULL DEFAULT 'simultaneo'
    CHECK (tipo_draft IN ('simultaneo','turno'));
ALTER TABLE public.salas
  ADD COLUMN IF NOT EXISTS formacao_default text NOT NULL DEFAULT '4-3-3';

-- sala_jogadores: bandeira do jogador/bot
ALTER TABLE public.sala_jogadores
  ADD COLUMN IF NOT EXISTS bandeira text;
