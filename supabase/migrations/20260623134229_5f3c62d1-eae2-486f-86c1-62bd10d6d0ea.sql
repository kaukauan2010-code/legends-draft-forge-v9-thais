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
CREATE POLICY "Profiles insertable by owner" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles updatable by owner" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.partidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modo TEXT NOT NULL CHECK (modo IN ('classico','almanaque','online')),
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
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
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

CREATE TABLE public.salas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  mestre_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modo TEXT NOT NULL DEFAULT 'classico' CHECK (modo IN ('classico','almanaque')),
  competicao TEXT NOT NULL DEFAULT 'copa' CHECK (competicao IN ('oitavas','final','copa')),
  velocidade TEXT NOT NULL DEFAULT 'rapida' CHECK (velocidade IN ('normal','rapida','ultra')),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','draft','torneio','em_jogo','finalizada')),
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
  elenco_online JSONB,
  fase_alcancada_torneio TEXT NOT NULL DEFAULT 'grupos',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pontos_grupo INT NOT NULL DEFAULT 0,
  gols_pro INT NOT NULL DEFAULT 0,
  gols_contra INT NOT NULL DEFAULT 0,
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

CREATE TABLE public.sala_draft (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sala_id UUID NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  formacao_id TEXT NOT NULL,
  estrategia TEXT NOT NULL DEFAULT 'equilibrada' CHECK (estrategia IN ('defensiva','equilibrada','ofensiva')),
  nome_time TEXT NOT NULL DEFAULT 'Meu Time',
  rodada_atual INT NOT NULL DEFAULT 0,
  selecoes_oferecidas TEXT[] NOT NULL DEFAULT '{}',
  jogadores_oferecidos JSONB,
  escolhas JSONB NOT NULL DEFAULT '[]'::jsonb,
  nomes_escolhidos TEXT[] NOT NULL DEFAULT '{}',
  rerolls_restantes INT NOT NULL DEFAULT 0,
  trocas_restantes INT NOT NULL DEFAULT 0,
  terminou BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sala_id, user_id)
);
CREATE INDEX sala_draft_sala_idx ON public.sala_draft(sala_id);
GRANT SELECT ON public.sala_draft TO authenticated;
GRANT ALL ON public.sala_draft TO service_role;
ALTER TABLE public.sala_draft ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros da sala veem o draft" ON public.sala_draft FOR SELECT TO authenticated
  USING (public.is_membro_sala(sala_id, auth.uid()) OR public.is_mestre_sala(sala_id, auth.uid()));
CREATE TRIGGER sala_draft_updated_at BEFORE UPDATE ON public.sala_draft FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.sala_draft;

CREATE OR REPLACE FUNCTION public.gerar_player_id()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidato TEXT;
BEGIN
  LOOP
    candidato := lpad(floor(random() * 100000000000)::bigint::text, 11, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE player_id = candidato);
  END LOOP;
  RETURN candidato;
END $$;
REVOKE EXECUTE ON FUNCTION public.gerar_player_id() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles ADD COLUMN player_id TEXT NOT NULL DEFAULT public.gerar_player_id();
ALTER TABLE public.profiles ADD CONSTRAINT profiles_player_id_key UNIQUE (player_id);

CREATE POLICY "Profiles viewable by any authenticated user" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, player_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Treinador'),
    NEW.raw_user_meta_data->>'avatar_url',
    public.gerar_player_id()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.stats_jogador (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_stats AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_stats();
REVOKE EXECUTE ON FUNCTION public.handle_new_user_stats() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.amizades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amigo_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceita')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id <> amigo_id),
  UNIQUE (user_id, amigo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amizades TO authenticated;
GRANT ALL ON public.amizades TO service_role;
ALTER TABLE public.amizades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Amizades viewable by participantes" ON public.amizades FOR SELECT TO authenticated USING (auth.uid() IN (user_id, amigo_id));
CREATE POLICY "Amizades insertable pelo remetente" ON public.amizades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Amizades aceitas so pelo destinatario" ON public.amizades FOR UPDATE TO authenticated
  USING (auth.uid() = amigo_id AND status = 'pendente') WITH CHECK (auth.uid() = amigo_id AND status = 'aceita');
CREATE POLICY "Amizades removiveis por qualquer participante" ON public.amizades FOR DELETE TO authenticated USING (auth.uid() IN (user_id, amigo_id));
CREATE TRIGGER amizades_touch BEFORE UPDATE ON public.amizades FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.amizades;

CREATE OR REPLACE FUNCTION public.is_amigo_aceito(_a UUID, _b UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.amizades WHERE status = 'aceita' AND ((user_id = _a AND amigo_id = _b) OR (user_id = _b AND amigo_id = _a)))
$$;
REVOKE EXECUTE ON FUNCTION public.is_amigo_aceito(UUID, UUID) FROM PUBLIC, anon, authenticated;
CREATE POLICY "Partidas viewable by amigos aceitos" ON public.partidas FOR SELECT TO authenticated USING (public.is_amigo_aceito(user_id, auth.uid()));
CREATE POLICY "Conquistas viewable by amigos aceitos" ON public.conquistas_desbloqueadas FOR SELECT TO authenticated USING (public.is_amigo_aceito(user_id, auth.uid()));

CREATE TABLE public.partida_online (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jogador1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jogador2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placar1 INT NOT NULL DEFAULT 0,
  placar2 INT NOT NULL DEFAULT 0,
  vencedor_id UUID REFERENCES auth.users(id),
  sala_id UUID REFERENCES public.salas(id) ON DELETE SET NULL,
  fase TEXT NOT NULL DEFAULT 'grupos' CHECK (fase IN ('grupos','oitavas','quartas','semi','final')),
  rodada INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jogador1_id <> jogador2_id)
);
GRANT SELECT ON public.partida_online TO authenticated;
GRANT ALL ON public.partida_online TO service_role;
ALTER TABLE public.partida_online ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Confrontos viewable by participantes" ON public.partida_online FOR SELECT TO authenticated USING (auth.uid() IN (jogador1_id, jogador2_id));
CREATE POLICY "Membros da sala veem partidas da sala" ON public.partida_online FOR SELECT TO authenticated
  USING (sala_id IS NOT NULL AND (public.is_membro_sala(sala_id, auth.uid()) OR public.is_mestre_sala(sala_id, auth.uid())));
CREATE INDEX partida_online_j1_idx ON public.partida_online(jogador1_id);
CREATE INDEX partida_online_j2_idx ON public.partida_online(jogador2_id);
CREATE INDEX partida_online_sala_fase ON public.partida_online(sala_id, fase, rodada);
ALTER PUBLICATION supabase_realtime ADD TABLE public.partida_online;

CREATE TABLE public.torneio_online (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sala_id UUID NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE UNIQUE,
  fase_atual TEXT NOT NULL DEFAULT 'grupos' CHECK (fase_atual IN ('grupos','oitavas','quartas','semi','final','encerrado')),
  rodada_grupos_atual INT NOT NULL DEFAULT 1,
  grupos JSONB NOT NULL DEFAULT '[]'::jsonb,
  chaveamento JSONB NOT NULL DEFAULT '[]'::jsonb,
  classificacao_grupos JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.torneio_online TO authenticated;
GRANT ALL ON public.torneio_online TO service_role;
ALTER TABLE public.torneio_online ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros da sala veem o torneio" ON public.torneio_online FOR SELECT TO authenticated
  USING (public.is_membro_sala(sala_id, auth.uid()) OR public.is_mestre_sala(sala_id, auth.uid()));
CREATE TRIGGER torneio_online_touch BEFORE UPDATE ON public.torneio_online FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.torneio_online;
CREATE INDEX torneio_online_sala_idx ON public.torneio_online(sala_id);

CREATE POLICY "Avatars usuario le os seus" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars usuario envia os seus" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars usuario atualiza os seus" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Avatars usuario apaga os seus" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);