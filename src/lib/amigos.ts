// ============================================================
// Sistema de amigos. Toda a autorização já é garantida pelas
// policies de RLS (ver migração `amigos.sql`) — aqui só ficam
// as queries tipadas + algumas checagens de UX (evitar solicitação
// duplicada, etc.) antes de bater no banco.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface PerfilPublico {
  id: string;
  display_name: string;
  avatar_url: string | null;
  player_id: string;
}

export type StatusAmizade = "pendente" | "aceita";

export interface AmizadeComPerfil {
  id: string;
  status: StatusAmizade;
  created_at: string;
  /** Perfil do OUTRO lado da amizade (nunca o meu). */
  perfil: PerfilPublico;
  /** true se EU enviei a solicitação (relevante pra pendentes). */
  enviadaPorMim: boolean;
}

export interface ResumoAmigo {
  perfil: PerfilPublico;
  partidas: number;
  vitorias: number;
  titulos: number;
  conquistas: number;
}

export interface HistoricoConfronto {
  partidas: number;
  vitorias: number;
  derrotas: number;
  empates: number;
}

/** Busca um jogador pelo Id Jogador (11 dígitos). Retorna null se não existir. */
export async function buscarJogadorPorId(playerId: string): Promise<PerfilPublico | null> {
  const limpo = playerId.trim();
  if (!/^\d{11}$/.test(limpo)) throw new Error("O Id Jogador tem 11 números.");
  const { data, error } = await supabase.from("profiles").select("id, display_name, avatar_url, player_id").eq("player_id", limpo).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PerfilPublico) ?? null;
}

/** Envia uma solicitação de amizade. Lança erro com mensagem amigável se já existir. */
export async function enviarSolicitacaoAmizade(meuId: string, amigoUserId: string): Promise<void> {
  if (meuId === amigoUserId) throw new Error("Você não pode adicionar a si mesmo.");
  const { data: existente } = await supabase
    .from("amizades")
    .select("id, status, user_id")
    .or(`and(user_id.eq.${meuId},amigo_id.eq.${amigoUserId}),and(user_id.eq.${amigoUserId},amigo_id.eq.${meuId})`)
    .maybeSingle();
  if (existente) {
    throw new Error(existente.status === "aceita" ? "Vocês já são amigos." : "Já existe uma solicitação entre vocês.");
  }
  const { error } = await supabase.from("amizades").insert({ user_id: meuId, amigo_id: amigoUserId });
  if (error) throw new Error(error.message);
}

/** Lista amizades aceitas, recebidas (pendentes pra mim aceitar) e enviadas (pendentes que eu mandei). */
export async function listarAmizades(meuId: string): Promise<{
  aceitas: AmizadeComPerfil[];
  recebidas: AmizadeComPerfil[];
  enviadas: AmizadeComPerfil[];
}> {
  const { data, error } = await supabase
    .from("amizades")
    .select("id, status, created_at, user_id, amigo_id")
    .or(`user_id.eq.${meuId},amigo_id.eq.${meuId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const linhas = data ?? [];
  if (!linhas.length) return { aceitas: [], recebidas: [], enviadas: [] };

  const outrosIds = [...new Set(linhas.map(l => (l.user_id === meuId ? l.amigo_id : l.user_id)))];
  const { data: perfis } = await supabase.from("profiles").select("id, display_name, avatar_url, player_id").in("id", outrosIds);
  const perfilPorId = new Map((perfis ?? []).map(p => [p.id, p as PerfilPublico]));

  const aceitas: AmizadeComPerfil[] = [];
  const recebidas: AmizadeComPerfil[] = [];
  const enviadas: AmizadeComPerfil[] = [];
  for (const l of linhas) {
    const enviadaPorMim = l.user_id === meuId;
    const outroId = enviadaPorMim ? l.amigo_id : l.user_id;
    const perfil = perfilPorId.get(outroId);
    if (!perfil) continue;
    const item: AmizadeComPerfil = { id: l.id, status: l.status as StatusAmizade, created_at: l.created_at, perfil, enviadaPorMim };
    if (l.status === "aceita") aceitas.push(item);
    else if (enviadaPorMim) enviadas.push(item);
    else recebidas.push(item);
  }
  return { aceitas, recebidas, enviadas };
}

/** Aceita uma solicitação recebida. */
export async function aceitarSolicitacao(amizadeId: string): Promise<void> {
  const { error } = await supabase.from("amizades").update({ status: "aceita" }).eq("id", amizadeId);
  if (error) throw new Error(error.message);
}

/** Recusa uma solicitação recebida, cancela uma enviada, ou desfaz uma amizade aceita — sempre uma exclusão. */
export async function removerAmizade(amizadeId: string): Promise<void> {
  const { error } = await supabase.from("amizades").delete().eq("id", amizadeId);
  if (error) throw new Error(error.message);
}

/** Dados públicos "tela inicial" de um amigo aceito — mesma fórmula do dashboard. */
export async function buscarResumoAmigo(amigoUserId: string): Promise<ResumoAmigo> {
  const [{ data: perfil, error: e1 }, { data: campanhas, error: e2 }, { data: conquistas, error: e3 }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, avatar_url, player_id").eq("id", amigoUserId).maybeSingle(),
    supabase.from("partidas").select("fase_alcancada, campeao").eq("user_id", amigoUserId),
    supabase.from("conquistas_desbloqueadas").select("conquista_id").eq("user_id", amigoUserId),
  ]);
  if (e1 || !perfil) throw new Error(e1?.message ?? "Perfil não encontrado (talvez vocês não sejam mais amigos).");
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  const todas = campanhas ?? [];
  const vitoriosas = todas.filter(p => p.fase_alcancada !== "grupos" && p.fase_alcancada !== "eliminado");
  const campeas = todas.filter(p => p.campeao);
  return {
    perfil: perfil as PerfilPublico,
    partidas: todas.length,
    vitorias: vitoriosas.length,
    titulos: campeas.length,
    conquistas: (conquistas ?? []).length,
  };
}

/** Confrontos diretos (online) contra um amigo. Fica zerado até a Fase 3 (torneio online) existir. */
export async function buscarHistoricoConfronto(meuId: string, amigoUserId: string): Promise<HistoricoConfronto> {
  const { data, error } = await supabase
    .from("partida_online")
    .select("jogador1_id, jogador2_id, vencedor_id")
    .or(`and(jogador1_id.eq.${meuId},jogador2_id.eq.${amigoUserId}),and(jogador1_id.eq.${amigoUserId},jogador2_id.eq.${meuId})`);
  if (error) throw new Error(error.message);
  const linhas = data ?? [];
  let vitorias = 0, derrotas = 0, empates = 0;
  for (const l of linhas) {
    if (!l.vencedor_id) empates++;
    else if (l.vencedor_id === meuId) vitorias++;
    else derrotas++;
  }
  return { partidas: linhas.length, vitorias, derrotas, empates };
}
