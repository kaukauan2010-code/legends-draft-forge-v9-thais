CREATE TABLE public.stats_jogador (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  partidas_jogadas INT NOT NULL DEFAULT 0,
  vitorias INT NOT NULL DEFAULT 0,
  derrotas INT NOT NULL DEFAULT 0,
  empates INT NOT NULL DEFAULT 0,
  gols_marcados INT NOT NULL DEFAULT 0,
  gols_sofridos INT NOT NULL DEFAULT 0,
  titulos INT NOT NULL DEFAULT 0,
  campanhas_completas INT NOT NULL DEFAULT 0,
  sequencia_vitorias_atual INT NOT NULL DEFAULT 0,
  sequencia_vitorias_recorde INT NOT NULL DEFAULT 0,
  sequencia_invicta_atual INT NOT NULL DEFAULT 0,
  sequencia_invicta_recorde INT NOT NULL DEFAULT 0,
  disputas_penaltis INT NOT NULL DEFAULT 0,
  penaltis_vencidos INT NOT NULL DEFAULT 0,
  jogadores_lendarios_escalados INT NOT NULL DEFAULT 0,
  drafts_modo_classico INT NOT NULL DEFAULT 0,
  drafts_modo_almanaque INT NOT NULL DEFAULT 0,
  trocas_usadas INT NOT NULL DEFAULT 0,
  rerolls_usados INT NOT NULL DEFAULT 0,
  improvisacoes_total INT NOT NULL DEFAULT 0,
  goleadas_5_mais INT NOT NULL DEFAULT 0,
  jogos_sem_sofrer_gol INT NOT NULL DEFAULT 0,
  formacoes_distintas_usadas TEXT[] NOT NULL DEFAULT '{}',
  selecoes_distintas_usadas TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.stats_jogador TO authenticated;
GRANT ALL ON public.stats_jogador TO service_role;
ALTER TABLE public.stats_jogador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stats viewable by owner" ON public.stats_jogador FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Stats insertable by owner" ON public.stats_jogador FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Stats updatable by owner" ON public.stats_jogador FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER stats_jogador_touch BEFORE UPDATE ON public.stats_jogador
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.conquistas_desbloqueadas (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conquista_id TEXT NOT NULL,
  desbloqueada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conquista_id)
);
GRANT SELECT, INSERT ON public.conquistas_desbloqueadas TO authenticated;
GRANT ALL ON public.conquistas_desbloqueadas TO service_role;
ALTER TABLE public.conquistas_desbloqueadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conquistas viewable by owner" ON public.conquistas_desbloqueadas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Conquistas insertable by owner" ON public.conquistas_desbloqueadas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX conquistas_user_idx ON public.conquistas_desbloqueadas(user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.stats_jogador (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created_stats
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();

REVOKE EXECUTE ON FUNCTION public.handle_new_user_stats() FROM PUBLIC, anon, authenticated;