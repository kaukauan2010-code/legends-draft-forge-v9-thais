-- ============================================================
-- FASE 2 — Draft online simultâneo
-- Uma linha por (sala_id, user_id): guarda a config de draft do
-- jogador (formação/estratégia/nome do time) + todo o progresso
-- do sorteio (seleção atual, histórico, escalação, rerolls/trocas).
--
-- Anti-cheat: nenhuma escrita é liberada para o client (sem GRANT
-- de INSERT/UPDATE para `authenticated`). Toda mutação passa pelas
-- server functions em `src/lib/draft-online.functions.ts`, que usam
-- o `supabaseAdmin` (service role) e validam tudo no servidor.
-- ============================================================

CREATE TABLE public.sala_draft (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sala_id UUID NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  formacao_id TEXT NOT NULL,
  estrategia TEXT NOT NULL DEFAULT 'equilibrada' CHECK (estrategia IN ('defensiva', 'equilibrada', 'ofensiva')),
  nome_time TEXT NOT NULL DEFAULT 'Meu Time',
  rodada_atual INT NOT NULL DEFAULT 0,
  selecoes_oferecidas TEXT[] NOT NULL DEFAULT '{}',
  jogadores_oferecidos JSONB,                     -- seleção sorteada atual (null = aguardando sorteio)
  escolhas JSONB NOT NULL DEFAULT '[]'::jsonb,    -- JogadorEscalado[] já escalados por este jogador
  nomes_escolhidos TEXT[] NOT NULL DEFAULT '{}',  -- nomes já escalados por ESTE jogador (espelha campanha.ts)
  rerolls_restantes INT NOT NULL DEFAULT 0,
  trocas_restantes INT NOT NULL DEFAULT 0,
  terminou BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sala_id, user_id)
);

CREATE INDEX sala_draft_sala_idx ON public.sala_draft(sala_id);

-- Somente SELECT é concedido ao client; INSERT/UPDATE ficam só com o
-- service_role (usado pelas server functions), de propósito — assim
-- nenhum client pode escrever seleções/escolhas diretamente.
GRANT SELECT ON public.sala_draft TO authenticated;
GRANT ALL ON public.sala_draft TO service_role;
ALTER TABLE public.sala_draft ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da sala veem o draft" ON public.sala_draft FOR SELECT TO authenticated
  USING (public.is_membro_sala(sala_id, auth.uid()) OR public.is_mestre_sala(sala_id, auth.uid()));

CREATE TRIGGER sala_draft_updated_at BEFORE UPDATE ON public.sala_draft
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.sala_draft;
