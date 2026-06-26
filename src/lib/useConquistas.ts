import { useCallback, useEffect, useRef, useState } from "react";
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

function chaveCacheConquistas(userId: string) {
  return `wcd-conquistas-desbloqueadas-${userId}`;
}

function lerCacheConquistas(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(chaveCacheConquistas(userId));
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function salvarCacheConquistas(userId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(chaveCacheConquistas(userId), JSON.stringify([...ids]));
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

function statsDoBanco(d: any): StatsJogador {
  return {
    partidas_jogadas: d.partidas_jogadas ?? 0, vitorias: d.vitorias ?? 0, derrotas: d.derrotas ?? 0, empates: d.empates ?? 0,
    gols_marcados: d.gols_marcados ?? 0, gols_sofridos: d.gols_sofridos ?? 0, titulos: d.titulos ?? 0,
    campanhas_completas: d.campanhas_completas ?? 0,
    sequencia_vitorias_atual: d.sequencia_vitorias_atual ?? 0, sequencia_vitorias_recorde: d.sequencia_vitorias_recorde ?? 0,
    sequencia_invicta_atual: d.sequencia_invicta_atual ?? 0, sequencia_invicta_recorde: d.sequencia_invicta_recorde ?? 0,
    disputas_penaltis: d.disputas_penaltis ?? 0, penaltis_vencidos: d.penaltis_vencidos ?? 0,
    jogadores_lendarios_escalados: d.jogadores_lendarios_escalados ?? 0,
    drafts_modo_classico: d.drafts_modo_classico ?? 0, drafts_modo_almanaque: d.drafts_modo_almanaque ?? 0,
    trocas_usadas: d.trocas_usadas ?? 0, rerolls_usados: d.rerolls_usados ?? 0,
    improvisacoes_total: d.improvisacoes_total ?? 0, goleadas_5_mais: d.goleadas_5_mais ?? 0,
    jogos_sem_sofrer_gol: d.jogos_sem_sofrer_gol ?? 0,
    formacoes_distintas_usadas: d.formacoes_distintas_usadas ?? [],
    selecoes_distintas_usadas: d.selecoes_distintas_usadas ?? [],
  };
}

export function useConquistas() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsJogador>(STATS_VAZIAS);
  const [desbloqueadasIds, setDesbloqueadasIds] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  // Refs sempre apontam pro valor mais recente — evita capturar set desatualizado
  // em closures de partidas em sequência (que causavam o toast da MESMA conquista
  // aparecer mais de uma vez).
  const statsRef = useRef<StatsJogador>(STATS_VAZIAS);
  const desbloqueadasRef = useRef<Set<string>>(new Set());
  const carregouRef = useRef(false);

  useEffect(() => {
    if (!user) {
      statsRef.current = STATS_VAZIAS;
      desbloqueadasRef.current = new Set();
      setStats(STATS_VAZIAS);
      setDesbloqueadasIds(new Set());
      carregouRef.current = false;
      setCarregando(false);
      return;
    }
    let cancelado = false;
    const cacheInicial = lerCacheConquistas(user.id);
    statsRef.current = STATS_VAZIAS;
    desbloqueadasRef.current = cacheInicial;
    carregouRef.current = false;
    setStats(STATS_VAZIAS);
    setDesbloqueadasIds(cacheInicial);
    (async () => {
      setCarregando(true);
      const [statsRes, conquistasRes] = await Promise.all([
        supabase.from("stats_jogador").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("conquistas_desbloqueadas").select("conquista_id").eq("user_id", user.id),
      ]);
      if (cancelado) return;
      let statsCarregadas = STATS_VAZIAS;
      if (statsRes.data) {
        const novo = statsDoBanco(statsRes.data);
        statsCarregadas = novo;
        statsRef.current = novo;
        setStats(novo);
      }
      {
        const idsBanco = new Set((conquistasRes.data ?? []).map(c => c.conquista_id));
        const ids = new Set([...cacheInicial, ...idsBanco]);
        desbloqueadasRef.current = ids;
        setDesbloqueadasIds(ids);
        salvarCacheConquistas(user.id, ids);
        // Reconcilia conquistas antigas: se as estatísticas já atingiram a meta,
        // a conquista deve contar no dashboard mesmo que a linha não tenha sido
        // gravada antes por algum bug de persistência.
        const faltantes = novasConquistas(statsCarregadas, ids);
        if (faltantes.length) {
          const novoSet = new Set(ids);
          faltantes.forEach(c => novoSet.add(c.id));
          desbloqueadasRef.current = novoSet;
          setDesbloqueadasIds(novoSet);
          salvarCacheConquistas(user.id, novoSet);
          await supabase.from("conquistas_desbloqueadas").upsert(
            faltantes.map(c => ({ user_id: user.id, conquista_id: c.id })),
            { onConflict: "user_id,conquista_id", ignoreDuplicates: true },
          );
        }
      }
      carregouRef.current = true;
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [user]);

  const registrarPartida = useCallback(async (ev: ResumoPartidaParaStats): Promise<Conquista[]> => {
    if (!user) return [];
    if (!carregouRef.current) {
      const [statsRes, conquistasRes] = await Promise.all([
        supabase.from("stats_jogador").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("conquistas_desbloqueadas").select("conquista_id").eq("user_id", user.id),
      ]);
      if (statsRes.data) {
        const atuais = statsDoBanco(statsRes.data);
        statsRef.current = atuais;
        setStats(atuais);
      }
      const ids = new Set([
        ...lerCacheConquistas(user.id),
        ...((conquistasRes.data ?? []).map(c => c.conquista_id)),
      ]);
      desbloqueadasRef.current = ids;
      setDesbloqueadasIds(ids);
      salvarCacheConquistas(user.id, ids);
      carregouRef.current = true;
    }
    const statsAntes = statsRef.current;
    const statsDepois = mesclarStats(statsAntes, ev);
    statsRef.current = statsDepois;
    setStats(statsDepois);

    const { error } = await supabase.from("stats_jogador").upsert({ user_id: user.id, ...statsDepois });
    if (error) return [];

    // Usa o set MAIS atual (ref) — não o snapshot do render.
    // Junta o estado em memória com o cache local. Mesmo se o banco falhar ou
    // demorar para carregar, uma conquista já notificada não volta a subir.
    const idsAtuais = new Set([...desbloqueadasRef.current, ...lerCacheConquistas(user.id)]);
    desbloqueadasRef.current = idsAtuais;
    const novas = novasConquistas(statsDepois, idsAtuais);
    if (novas.length) {
      const novoSet = new Set(idsAtuais);
      novas.forEach(c => novoSet.add(c.id));
      desbloqueadasRef.current = novoSet;
      setDesbloqueadasIds(novoSet);
      salvarCacheConquistas(user.id, novoSet);
      // upsert com onConflict ignora duplicatas se duas chamadas concorrerem.
      await supabase.from("conquistas_desbloqueadas").upsert(
        novas.map(c => ({ user_id: user.id, conquista_id: c.id })),
        { onConflict: "user_id,conquista_id", ignoreDuplicates: true },
      );
    }
    return novas;
  }, [user]);

  const conquistasComProgresso: ConquistaComProgresso[] = calcularProgresso(stats, desbloqueadasIds);

  // Conta também conquistas que as estatísticas já comprovam como desbloqueadas.
  // Assim dashboard/tela de conquistas não ficam 0/100 se o registro remoto falhar.
  const totalDesbloqueadas = conquistasComProgresso.filter(c => c.desbloqueada).length;

  return {
    stats,
    conquistas: conquistasComProgresso,
    totalDesbloqueadas,
    carregando,
    registrarPartida,
  };
}
