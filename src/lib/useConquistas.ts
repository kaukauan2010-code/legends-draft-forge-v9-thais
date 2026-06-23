import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  STATS_VAZIAS, calcularProgresso, novasConquistas,
  type StatsJogador, type Conquista, type ConquistaComProgresso,
} from "@/lib/conquistas";

export interface ResumoPartidaParaStats {
  vitoria: boolean;
  empate: boolean;
  golsMeu: number;
  golsAdv: number;
  formacaoId: string;
  selecoesUsadas: string[];
  jogadoresLendariosEscalados: number;
  improvisados: number;
  foiPenaltis: boolean;
  venceuPenaltis?: boolean;
  campanhaEncerrada?: boolean;
  campeao?: boolean;
  modo?: "classico" | "almanaque";
  trocasUsadasNestaCompanha?: number;
  rerollsUsadosNestaCompanha?: number;
}

function mesclarStats(atual: StatsJogador, ev: ResumoPartidaParaStats): StatsJogador {
  const novo: StatsJogador = { ...atual };
  novo.partidas_jogadas += 1;
  novo.gols_marcados += ev.golsMeu;
  novo.gols_sofridos += ev.golsAdv;
  if (ev.golsAdv === 0) novo.jogos_sem_sofrer_gol += 1;
  if (ev.golsMeu - ev.golsAdv >= 5) novo.goleadas_5_mais += 1;
  novo.improvisacoes_total += (ev.vitoria && ev.improvisados > 0) ? 1 : 0;
  novo.jogadores_lendarios_escalados = Math.max(novo.jogadores_lendarios_escalados, ev.jogadoresLendariosEscalados);

  if (ev.vitoria) {
    novo.vitorias += 1;
    novo.sequencia_vitorias_atual += 1;
    novo.sequencia_vitorias_recorde = Math.max(novo.sequencia_vitorias_recorde, novo.sequencia_vitorias_atual);
    novo.sequencia_invicta_atual += 1;
    novo.sequencia_invicta_recorde = Math.max(novo.sequencia_invicta_recorde, novo.sequencia_invicta_atual);
  } else if (ev.empate) {
    novo.empates += 1;
    novo.sequencia_vitorias_atual = 0;
    novo.sequencia_invicta_atual += 1;
    novo.sequencia_invicta_recorde = Math.max(novo.sequencia_invicta_recorde, novo.sequencia_invicta_atual);
  } else {
    novo.derrotas += 1;
    novo.sequencia_vitorias_atual = 0;
    novo.sequencia_invicta_atual = 0;
  }

  if (ev.foiPenaltis) {
    novo.disputas_penaltis += 1;
    if (ev.venceuPenaltis) novo.penaltis_vencidos += 1;
  }

  if (!novo.formacoes_distintas_usadas.includes(ev.formacaoId)) {
    novo.formacoes_distintas_usadas = [...novo.formacoes_distintas_usadas, ev.formacaoId];
  }
  const novasSelecoes = ev.selecoesUsadas.filter(id => !novo.selecoes_distintas_usadas.includes(id));
  if (novasSelecoes.length) {
    novo.selecoes_distintas_usadas = [...novo.selecoes_distintas_usadas, ...novasSelecoes];
  }

  if (ev.campanhaEncerrada) {
    novo.campanhas_completas += 1;
    if (ev.campeao) novo.titulos += 1;
    if (ev.modo === "classico") novo.drafts_modo_classico += 1;
    if (ev.modo === "almanaque") novo.drafts_modo_almanaque += 1;
    novo.trocas_usadas += ev.trocasUsadasNestaCompanha ?? 0;
    novo.rerolls_usados += ev.rerollsUsadosNestaCompanha ?? 0;
  }

  return novo;
}

export function useConquistas() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsJogador>(STATS_VAZIAS);
  const [desbloqueadasIds, setDesbloqueadasIds] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!user) { setCarregando(false); return; }
    let cancelado = false;
    (async () => {
      setCarregando(true);
      const [statsRes, conquistasRes] = await Promise.all([
        supabase.from("stats_jogador").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("conquistas_desbloqueadas").select("conquista_id").eq("user_id", user.id),
      ]);
      if (cancelado) return;
      if (statsRes.data) {
        const d = statsRes.data;
        setStats({
          partidas_jogadas: d.partidas_jogadas, vitorias: d.vitorias, derrotas: d.derrotas, empates: d.empates,
          gols_marcados: d.gols_marcados, gols_sofridos: d.gols_sofridos, titulos: d.titulos,
          campanhas_completas: d.campanhas_completas,
          sequencia_vitorias_atual: d.sequencia_vitorias_atual, sequencia_vitorias_recorde: d.sequencia_vitorias_recorde,
          sequencia_invicta_atual: d.sequencia_invicta_atual, sequencia_invicta_recorde: d.sequencia_invicta_recorde,
          disputas_penaltis: d.disputas_penaltis, penaltis_vencidos: d.penaltis_vencidos,
          jogadores_lendarios_escalados: d.jogadores_lendarios_escalados,
          drafts_modo_classico: d.drafts_modo_classico, drafts_modo_almanaque: d.drafts_modo_almanaque,
          trocas_usadas: d.trocas_usadas, rerolls_usados: d.rerolls_usados,
          improvisacoes_total: d.improvisacoes_total, goleadas_5_mais: d.goleadas_5_mais,
          jogos_sem_sofrer_gol: d.jogos_sem_sofrer_gol,
          formacoes_distintas_usadas: d.formacoes_distintas_usadas ?? [],
          selecoes_distintas_usadas: d.selecoes_distintas_usadas ?? [],
        });
      }
      if (conquistasRes.data) {
        setDesbloqueadasIds(new Set(conquistasRes.data.map(c => c.conquista_id)));
      }
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [user]);

  const registrarPartida = useCallback(async (ev: ResumoPartidaParaStats): Promise<Conquista[]> => {
    if (!user) return [];
    const statsAntes = stats;
    const statsDepois = mesclarStats(statsAntes, ev);
    setStats(statsDepois);

    const { error } = await supabase.from("stats_jogador").upsert({ user_id: user.id, ...statsDepois });
    if (error) {
      // Não bloqueia o jogo se a gravação falhar — apenas não persiste o progresso desta partida.
      return [];
    }

    const novas = novasConquistas(statsDepois, desbloqueadasIds);
    if (novas.length) {
      const novoSet = new Set(desbloqueadasIds);
      novas.forEach(c => novoSet.add(c.id));
      setDesbloqueadasIds(novoSet);
      await supabase.from("conquistas_desbloqueadas").insert(
        novas.map(c => ({ user_id: user.id, conquista_id: c.id })),
      );
    }
    return novas;
  }, [user, stats, desbloqueadasIds]);

  const conquistasComProgresso: ConquistaComProgresso[] = calcularProgresso(stats, desbloqueadasIds);

  return {
    stats,
    conquistas: conquistasComProgresso,
    totalDesbloqueadas: desbloqueadasIds.size,
    carregando,
    registrarPartida,
  };
}
