-- Fase 3, Etapa 3.6 (fechamento de gaps): permite registrar campanhas do
-- torneio online na mesma tabela de histórico do modo solo.
ALTER TABLE public.partidas DROP CONSTRAINT IF EXISTS partidas_modo_check;
ALTER TABLE public.partidas ADD CONSTRAINT partidas_modo_check
  CHECK (modo IN ('classico', 'almanaque', 'online'));
