-- Consolidada: novas features (online/amigos/torneio) + ajustes
-- 1. partidas: aceitar modo 'online'
ALTER TABLE public.partidas DROP CONSTRAINT IF EXISTS partidas_modo_check;
ALTER TABLE public.partidas ADD CONSTRAINT partidas_modo_check
  CHECK (modo IN ('classico', 'almanaque', 'online'));

-- 2. player_id em profiles
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

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS player_id TEXT;
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.profiles WHERE player_id IS NULL LOOP
    UPDATE public.profiles SET player_id = public.gerar_player_id() WHERE id = rec.id;
  END LOOP;
END $$;
ALTER TABLE public.profiles ALTER COLUMN player_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_player_id_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_player_id_key UNIQUE (player_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Profiles viewable by any authenticated user" ON public.profiles;
CREATE POLICY "Profiles viewable by any authenticated user" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Atualiza handle_new_user para preencher player_id
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
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. Salas
CREATE TABLE IF NOT EXISTS public.salas (
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

CREATE TABLE IF NOT EXISTS public.sala_jogadores (
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
REVOKE EXECUTE ON FUNCTION public.is_membro_sala(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_mestre_sala(UUID, UUID) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Salas visiveis para todos" ON public.salas;
CREATE POLICY "Salas visiveis para todos" ON public.salas FOR SELECT USING (true);
DROP POLICY IF EXISTS "Criar sala se autenticado e for mestre" ON public.salas;
CREATE POLICY "Criar sala se autenticado e for mestre" ON public.salas FOR INSERT TO authenticated WITH CHECK (auth.uid() = mestre_id);
DROP POLICY IF EXISTS "Mestre atualiza sua sala" ON public.salas;
CREATE POLICY "Mestre atualiza sua sala" ON public.salas FOR UPDATE TO authenticated USING (auth.uid() = mestre_id) WITH CHECK (auth.uid() = mestre_id);
DROP POLICY IF EXISTS "Mestre apaga sua sala" ON public.salas;
CREATE POLICY "Mestre apaga sua sala" ON public.salas FOR DELETE TO authenticated USING (auth.uid() = mestre_id);

DROP POLICY IF EXISTS "Jogadores visiveis para todos" ON public.sala_jogadores;
CREATE POLICY "Jogadores visiveis para todos" ON public.sala_jogadores FOR SELECT USING (true);
DROP POLICY IF EXISTS "Entrar na sala" ON public.sala_jogadores;
CREATE POLICY "Entrar na sala" ON public.sala_jogadores FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()));
DROP POLICY IF EXISTS "Atualiza proprio registro ou mestre" ON public.sala_jogadores;
CREATE POLICY "Atualiza proprio registro ou mestre" ON public.sala_jogadores FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()));
DROP POLICY IF EXISTS "Sai da sala ou mestre remove" ON public.sala_jogadores;
CREATE POLICY "Sai da sala ou mestre remove" ON public.sala_jogadores FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_mestre_sala(sala_id, auth.uid()));

DROP TRIGGER IF EXISTS salas_updated_at ON public.salas;
CREATE TRIGGER salas_updated_at BEFORE UPDATE ON public.salas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='salas') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salas;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sala_jogadores') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sala_jogadores;
  END IF;
END $$;

-- 4. sala_draft
CREATE TABLE IF NOT EXISTS public.sala_draft (
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
CREATE INDEX IF NOT EXISTS sala_draft_sala_idx ON public.sala_draft(sala_id);
GRANT SELECT ON public.sala_draft TO authenticated;
GRANT ALL ON public.sala_draft TO service_role;
ALTER TABLE public.sala_draft ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros da sala veem o draft" ON public.sala_draft;
CREATE POLICY "Membros da sala veem o draft" ON public.sala_draft FOR SELECT TO authenticated
  USING (public.is_membro_sala(sala_id, auth.uid()) OR public.is_mestre_sala(sala_id, auth.uid()));
DROP TRIGGER IF EXISTS sala_draft_updated_at ON public.sala_draft;
CREATE TRIGGER sala_draft_updated_at BEFORE UPDATE ON public.sala_draft FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sala_draft') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sala_draft;
  END IF;
END $$;

-- 5. Amizades
CREATE TABLE IF NOT EXISTS public.amizades (
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
DROP POLICY IF EXISTS "Amizades viewable by participantes" ON public.amizades;
CREATE POLICY "Amizades viewable by participantes" ON public.amizades FOR SELECT TO authenticated USING (auth.uid() IN (user_id, amigo_id));
DROP POLICY IF EXISTS "Amizades insertable pelo remetente" ON public.amizades;
CREATE POLICY "Amizades insertable pelo remetente" ON public.amizades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Amizades aceitas so pelo destinatario" ON public.amizades;
CREATE POLICY "Amizades aceitas so pelo destinatario" ON public.amizades FOR UPDATE TO authenticated
  USING (auth.uid() = amigo_id AND status = 'pendente') WITH CHECK (auth.uid() = amigo_id AND status = 'aceita');
DROP POLICY IF EXISTS "Amizades removiveis por qualquer participante" ON public.amizades;
CREATE POLICY "Amizades removiveis por qualquer participante" ON public.amizades FOR DELETE TO authenticated USING (auth.uid() IN (user_id, amigo_id));
DROP TRIGGER IF EXISTS amizades_touch ON public.amizades;
CREATE TRIGGER amizades_touch BEFORE UPDATE ON public.amizades FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='amizades') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.amizades;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_amigo_aceito(_a UUID, _b UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.amizades WHERE status = 'aceita' AND ((user_id = _a AND amigo_id = _b) OR (user_id = _b AND amigo_id = _a)))
$$;
REVOKE EXECUTE ON FUNCTION public.is_amigo_aceito(UUID, UUID) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Partidas viewable by amigos aceitos" ON public.partidas;
CREATE POLICY "Partidas viewable by amigos aceitos" ON public.partidas FOR SELECT TO authenticated USING (public.is_amigo_aceito(user_id, auth.uid()));
DROP POLICY IF EXISTS "Conquistas viewable by amigos aceitos" ON public.conquistas_desbloqueadas;
CREATE POLICY "Conquistas viewable by amigos aceitos" ON public.conquistas_desbloqueadas FOR SELECT TO authenticated USING (public.is_amigo_aceito(user_id, auth.uid()));

-- 6. Partida online
CREATE TABLE IF NOT EXISTS public.partida_online (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jogador1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jogador2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placar1 INT NOT NULL DEFAULT 0,
  placar2 INT NOT NULL DEFAULT 0,
  vencedor_id UUID REFERENCES auth.users(id),
  sala_id UUID REFERENCES public.salas(id) ON DELETE SET NULL,
  fase TEXT NOT NULL DEFAULT 'grupos' CHECK (fase IN ('grupos','oitavas','quartas','semi','final')),
  rodada INT NOT NULL DEFAULT 1,
  log_eventos JSONB NOT NULL DEFAULT '[]'::jsonb,
  penaltis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jogador1_id <> jogador2_id)
);
GRANT SELECT ON public.partida_online TO authenticated;
GRANT ALL ON public.partida_online TO service_role;
ALTER TABLE public.partida_online ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Confrontos viewable by participantes" ON public.partida_online;
CREATE POLICY "Confrontos viewable by participantes" ON public.partida_online FOR SELECT TO authenticated USING (auth.uid() IN (jogador1_id, jogador2_id));
CREATE INDEX IF NOT EXISTS partida_online_j1_idx ON public.partida_online(jogador1_id);
CREATE INDEX IF NOT EXISTS partida_online_j2_idx ON public.partida_online(jogador2_id);
-- Adiciona colunas se a tabela já existir sem elas
ALTER TABLE public.partida_online ADD COLUMN IF NOT EXISTS fase TEXT NOT NULL DEFAULT 'grupos';
ALTER TABLE public.partida_online ADD COLUMN IF NOT EXISTS rodada INT NOT NULL DEFAULT 1;
ALTER TABLE public.partida_online ADD COLUMN IF NOT EXISTS log_eventos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.partida_online ADD COLUMN IF NOT EXISTS penaltis JSONB;