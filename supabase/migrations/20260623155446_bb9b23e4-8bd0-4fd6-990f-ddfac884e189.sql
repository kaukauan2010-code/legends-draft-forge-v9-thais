CREATE TABLE IF NOT EXISTS public.torneio_online (
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
DROP POLICY IF EXISTS "Membros da sala veem o torneio" ON public.torneio_online;
CREATE POLICY "Membros da sala veem o torneio" ON public.torneio_online FOR SELECT TO authenticated
  USING (public.is_membro_sala(sala_id, auth.uid()) OR public.is_mestre_sala(sala_id, auth.uid()));
DROP TRIGGER IF EXISTS torneio_online_touch ON public.torneio_online;
CREATE TRIGGER torneio_online_touch BEFORE UPDATE ON public.torneio_online FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='torneio_online') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.torneio_online;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS torneio_online_sala_idx ON public.torneio_online(sala_id);
CREATE INDEX IF NOT EXISTS partida_online_sala_fase ON public.partida_online(sala_id, fase, rodada);

-- Storage policies avatars (caso ainda não existam)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars usuario le os seus') THEN
    CREATE POLICY "Avatars usuario le os seus" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars usuario envia os seus') THEN
    CREATE POLICY "Avatars usuario envia os seus" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars usuario atualiza os seus') THEN
    CREATE POLICY "Avatars usuario atualiza os seus" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Avatars usuario apaga os seus') THEN
    CREATE POLICY "Avatars usuario apaga os seus" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;