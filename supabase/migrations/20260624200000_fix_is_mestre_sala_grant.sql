-- Correção: as funções is_membro_sala e is_mestre_sala são SECURITY DEFINER,
-- o que significa que rodam com permissões do owner (postgres/service_role).
-- Porém o REVOKE EXECUTE bloqueou também o papel `authenticated` de *chamar*
-- a função nas políticas RLS. Como as políticas são avaliadas no contexto do
-- usuário, o Postgres precisa ter permissão para executar a função no contexto
-- da chamada da policy. Solução: re-grant EXECUTE para authenticated.

GRANT EXECUTE ON FUNCTION public.is_membro_sala(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mestre_sala(UUID, UUID) TO authenticated;
