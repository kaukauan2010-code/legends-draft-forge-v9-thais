-- ============================================================
-- SISTEMA DE AMIGOS — Id Jogador (11 dígitos) + amizades
-- ============================================================

-- ---------- 1. Id Jogador: 11 caracteres numéricos, único ----------
CREATE OR REPLACE FUNCTION public.gerar_player_id()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  candidato TEXT;
BEGIN
  LOOP
    candidato := lpad(floor(random() * 100000000000)::bigint::text, 11, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE player_id = candidato);
  END LOOP;
  RETURN candidato;
END $$;
REVOKE EXECUTE ON FUNCTION public.gerar_player_id() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles ADD COLUMN player_id TEXT;

DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.profiles WHERE player_id IS NULL LOOP
    UPDATE public.profiles SET player_id = public.gerar_player_id() WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE public.profiles ALTER COLUMN player_id SET NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_player_id_key UNIQUE (player_id);

-- Qualquer jogador autenticado pode ver display_name/avatar/player_id de qualquer
-- outro jogador (nenhuma dessas colunas é sensível) — é o que viabiliza a busca por Id.
CREATE POLICY "Profiles viewable by any authenticated user" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Novos cadastros já saem com player_id preenchido.
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

-- ---------- 2. Amizades (solicitação → aceita) ----------
CREATE TABLE public.amizades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- quem enviou a solicitação
  amigo_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- quem recebeu
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceita')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id <> amigo_id),
  UNIQUE (user_id, amigo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amizades TO authenticated;
GRANT ALL ON public.amizades TO service_role;
ALTER TABLE public.amizades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Amizades viewable by participantes" ON public.amizades FOR SELECT TO authenticated
  USING (auth.uid() IN (user_id, amigo_id));
CREATE POLICY "Amizades insertable pelo remetente" ON public.amizades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Amizades aceitas só pelo destinatário" ON public.amizades FOR UPDATE TO authenticated
  USING (auth.uid() = amigo_id AND status = 'pendente') WITH CHECK (auth.uid() = amigo_id AND status = 'aceita');
CREATE POLICY "Amizades removíveis por qualquer participante" ON public.amizades FOR DELETE TO authenticated
  USING (auth.uid() IN (user_id, amigo_id));

CREATE TRIGGER amizades_touch BEFORE UPDATE ON public.amizades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.amizades;

CREATE OR REPLACE FUNCTION public.is_amigo_aceito(_a UUID, _b UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.amizades
    WHERE status = 'aceita' AND ((user_id = _a AND amigo_id = _b) OR (user_id = _b AND amigo_id = _a))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_amigo_aceito(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Dashboard resumido do amigo: amigos aceitos podem ver partidas/conquistas
-- (mesmos dados já exibidos na própria tela inicial), nunca alterar.
CREATE POLICY "Partidas viewable by amigos aceitos" ON public.partidas FOR SELECT TO authenticated
  USING (public.is_amigo_aceito(user_id, auth.uid()));
CREATE POLICY "Conquistas viewable by amigos aceitos" ON public.conquistas_desbloqueadas FOR SELECT TO authenticated
  USING (public.is_amigo_aceito(user_id, auth.uid()));

-- ---------- 3. Placeholder do histórico de confrontos (populado na Fase 3 online) ----------
CREATE TABLE public.partida_online (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jogador1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jogador2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  placar1 INT NOT NULL DEFAULT 0,
  placar2 INT NOT NULL DEFAULT 0,
  vencedor_id UUID REFERENCES auth.users(id), -- null = empate
  sala_id UUID REFERENCES public.salas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jogador1_id <> jogador2_id)
);
GRANT SELECT ON public.partida_online TO authenticated;
GRANT ALL ON public.partida_online TO service_role;
ALTER TABLE public.partida_online ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Confrontos viewable by participantes" ON public.partida_online FOR SELECT TO authenticated
  USING (auth.uid() IN (jogador1_id, jogador2_id));
CREATE INDEX partida_online_j1_idx ON public.partida_online(jogador1_id);
CREATE INDEX partida_online_j2_idx ON public.partida_online(jogador2_id);
