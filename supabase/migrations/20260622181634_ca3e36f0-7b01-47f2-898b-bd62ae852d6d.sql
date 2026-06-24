CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Treinador',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by owner" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles insertable by owner" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles updatable by owner" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.partidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modo TEXT NOT NULL,
  formacao TEXT NOT NULL,
  estrategia TEXT NOT NULL,
  fase_alcancada TEXT NOT NULL,
  pontuacao INT NOT NULL DEFAULT 0,
  campeao BOOLEAN NOT NULL DEFAULT false,
  elenco JSONB NOT NULL DEFAULT '[]'::jsonb,
  log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partidas TO authenticated;
GRANT ALL ON public.partidas TO service_role;
ALTER TABLE public.partidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partidas viewable by owner" ON public.partidas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Partidas insertable by owner" ON public.partidas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Partidas updatable by owner" ON public.partidas FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Partidas deletable by owner" ON public.partidas FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX partidas_user_idx ON public.partidas(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Treinador'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

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
CREATE TRIGGER stats_jogador_touch BEFORE UPDATE ON public.stats_jogador FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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
  INSERT INTO public.stats_jogador (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_stats AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();
REVOKE EXECUTE ON FUNCTION public.handle_new_user_stats() FROM PUBLIC, anon, authenticated;

CREATE POLICY "Avatars usuario le os seus" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars usuario envia os seus" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars usuario atualiza os seus" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars usuario apaga os seus" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE TABLE public.salas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  mestre_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modo TEXT NOT NULL DEFAULT 'classico' CHECK (modo IN ('classico','almanaque')),
  competicao TEXT NOT NULL DEFAULT 'copa' CHECK (competicao IN ('oitavas','final','copa')),
  velocidade TEXT NOT NULL DEFAULT 'rapida' CHECK (velocidade IN ('normal','rapida','ultra')),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','draft','em_jogo','finalizada')),
  max_jogadores INT NOT NULL DEFAULT 32,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salas TO authenticated;
GRANT SELECT ON public.salas TO anon;
GRANT ALL ON public.salas TO service_role;
ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sala_jogadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sala_id UUID NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  is_cpu BOOLEAN NOT NULL DEFAULT false,
  pronto BOOLEAN NOT NULL DEFAULT false,
  slot INT NOT NULL,
  grupo TEXT,
  eliminado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sala_id, slot)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sala_jogadores TO authenticated;
GRANT SELECT ON public.sala_jogadores TO anon;
GRANT ALL ON public.sala_jogadores TO service_role;
ALTER TABLE public.sala_jogadores ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_membro_sala(_sala_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sala_jogadores WHERE sala_id = _sala_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_mestre_sala(_sala_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.salas WHERE id = _sala_id AND mestre_id = _user_id);
$$;

CREATE POLICY "Salas visiveis para todos" ON public.salas FOR SELECT USING (true);
CREATE POLICY "Criar sala se autenticado e for mestre" ON public.salas FOR INSERT TO authenticated WITH CHECK (auth.uid() = mestre_id);
CREATE POLICY "Mestre atualiza sua sala" ON public.salas FOR UPDATE TO authenticated USING (auth.uid() = mestre_id) WITH CHECK (auth.uid() = mestre_id);
CREATE POLICY "Mestre apaga sua sala" ON public.salas FOR DELETE TO authenticated USING (auth.uid() = mestre_id);

CREATE POLICY "Jogadores visiveis para todos" ON public.sala_jogadores FOR SELECT USING (true);
CREATE POLICY "Entrar na sala" ON public.sala_jogadores FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()));
CREATE POLICY "Atualiza proprio registro ou mestre" ON public.sala_jogadores FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()));
CREATE POLICY "Sai da sala ou mestre remove" ON public.sala_jogadores FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()));

CREATE TRIGGER salas_updated_at BEFORE UPDATE ON public.salas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.salas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sala_jogadores;

REVOKE EXECUTE ON FUNCTION public.is_membro_sala(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_mestre_sala(UUID, UUID) FROM PUBLIC, anon, authenticated;