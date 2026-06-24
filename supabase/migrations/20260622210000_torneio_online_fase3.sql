-- ============================================================
-- FASE 3 — Torneio online
-- ============================================================

-- ---------- 1. Adicionar status "torneio" em salas ----------
-- O CHECK atual é: ('lobby','draft','em_jogo','finalizada')
-- Adicionamos 'torneio' entre 'draft' e 'em_jogo'.
ALTER TABLE public.salas DROP CONSTRAINT IF EXISTS salas_status_check;
ALTER TABLE public.salas ADD CONSTRAINT salas_status_check
  CHECK (status IN ('lobby', 'draft', 'torneio', 'em_jogo', 'finalizada'));

-- ---------- 2. Colunas extras em sala_jogadores ----------
-- elenco_online: JogadorEscalado[] copiado de sala_draft.escolhas ao
--   transitar para o torneio (assim o torneio não depende do draft).
-- fase_alcancada_torneio: controle de eliminação ('grupos','oitavas',
--   'quartas','semi','final','campeao').
-- last_seen_at: para gestão de desconexão (Etapa 3.5).
-- pontos_grupo: acumulador de pontos na fase de grupos (W=3, D=1, L=0).
-- gols_pro / gols_contra: saldo para desempate nos grupos.
ALTER TABLE public.sala_jogadores
  ADD COLUMN IF NOT EXISTS elenco_online        JSONB,
  ADD COLUMN IF NOT EXISTS fase_alcancada_torneio TEXT NOT NULL DEFAULT 'grupos',
  ADD COLUMN IF NOT EXISTS last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pontos_grupo         INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gols_pro             INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gols_contra          INT  NOT NULL DEFAULT 0;

-- ---------- 3. Complementar partida_online ----------
-- A tabela já existe (criada em amigos.sql) com:
--   id, jogador1_id, jogador2_id, placar1, placar2, vencedor_id, sala_id, created_at
-- Adicionamos:
-- fase: em qual fase do torneio essa partida aconteceu.
-- rodada: número da rodada na fase de grupos (1-3) ou mata-mata (1).
-- log_eventos: JSONB com os eventos minuto-a-minuto gerados pelo servidor
--   (fonte canônica para o replay no front dos dois lados).
-- penaltis: JSONB com a sequência de cobranças, se houver.
-- encerrada: flag para indicar que o resultado já foi gravado
--   (evita dupla escrita por corrida entre os dois clientes).
ALTER TABLE public.partida_online
  ADD COLUMN IF NOT EXISTS fase       TEXT NOT NULL DEFAULT 'grupos'
    CHECK (fase IN ('grupos', 'oitavas', 'quartas', 'semi', 'final')),
  ADD COLUMN IF NOT EXISTS rodada     INT  NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS log_eventos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS penaltis   JSONB,
  ADD COLUMN IF NOT EXISTS encerrada  BOOLEAN NOT NULL DEFAULT false;

-- Permite que participantes vejam sua própria partida (já existia parcialmente).
-- Ampliamos: membros da sala também podem ver todas as partidas da sala
-- (para exibir o bracket e resultados de confrontos alheios).
CREATE POLICY "Membros da sala veem partidas da sala" ON public.partida_online
  FOR SELECT TO authenticated
  USING (public.is_membro_sala(sala_id, auth.uid()));

-- Partidas são escritas exclusivamente pelo service_role (server functions).
-- Nenhum GRANT de INSERT/UPDATE para authenticated.
GRANT SELECT ON public.partida_online TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.partida_online;

-- ---------- 4. Tabela principal: torneio_online ----------
-- Uma linha por sala — criada quando o mestre avança de 'draft' → 'torneio'.
-- Guarda o estado completo do torneio: grupos gerados, chaveamento de
-- mata-mata, rodada atual, fase atual.
--
-- Estrutura do JSONB `grupos`:
--   Array de 8 grupos (A–H), cada um com array de { slot_id, nome, grupo }.
-- Estrutura do JSONB `chaveamento`:
--   Array de rodadas do mata-mata; cada rodada é um array de confrontos:
--   { id, slot1_id, slot2_id, vencedor_slot_id?, partida_online_id? }
-- Estrutura do JSONB `classificacao_grupos`:
--   Mapa de slot_id → { pontos, gols_pro, gols_contra, jogos }
CREATE TABLE public.torneio_online (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sala_id               UUID NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE UNIQUE,
  fase_atual            TEXT NOT NULL DEFAULT 'grupos'
    CHECK (fase_atual IN ('grupos', 'oitavas', 'quartas', 'semi', 'final', 'encerrado')),
  rodada_grupos_atual   INT  NOT NULL DEFAULT 1, -- 1, 2 ou 3
  grupos                JSONB NOT NULL DEFAULT '[]'::jsonb,
  chaveamento           JSONB NOT NULL DEFAULT '[]'::jsonb,
  classificacao_grupos  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.torneio_online TO authenticated;
GRANT ALL    ON public.torneio_online TO service_role;
ALTER TABLE public.torneio_online ENABLE ROW LEVEL SECURITY;

-- Qualquer membro da sala pode ver o torneio.
CREATE POLICY "Membros da sala veem o torneio" ON public.torneio_online
  FOR SELECT TO authenticated
  USING (public.is_membro_sala(sala_id, auth.uid()) OR public.is_mestre_sala(sala_id, auth.uid()));

CREATE TRIGGER torneio_online_touch BEFORE UPDATE ON public.torneio_online
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.torneio_online;

-- Índices auxiliares
CREATE INDEX torneio_online_sala_idx  ON public.torneio_online(sala_id);
CREATE INDEX partida_online_sala_fase ON public.partida_online(sala_id, fase, rodada);
