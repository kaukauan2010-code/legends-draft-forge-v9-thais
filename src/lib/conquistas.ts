// Sistema de Conquistas — 100 conquistas cumulativas baseadas no progresso do jogador
// ao longo de várias partidas e campanhas (não apenas em uma única sessão).

export type CategoriaConquista =
  | "vitorias" | "gols" | "titulos" | "sequencias" | "penaltis"
  | "draft" | "modos" | "variedade" | "defesa" | "especiais";

export type TierConquista = "bronze" | "prata" | "ouro" | "platina" | "lendaria";

export interface StatsJogador {
  partidas_jogadas: number;
  vitorias: number;
  derrotas: number;
  empates: number;
  gols_marcados: number;
  gols_sofridos: number;
  titulos: number;
  campanhas_completas: number;
  sequencia_vitorias_atual: number;
  sequencia_vitorias_recorde: number;
  sequencia_invicta_atual: number;
  sequencia_invicta_recorde: number;
  disputas_penaltis: number;
  penaltis_vencidos: number;
  jogadores_lendarios_escalados: number;
  drafts_modo_classico: number;
  drafts_modo_almanaque: number;
  trocas_usadas: number;
  rerolls_usados: number;
  improvisacoes_total: number;
  goleadas_5_mais: number;
  jogos_sem_sofrer_gol: number;
  formacoes_distintas_usadas: string[];
  selecoes_distintas_usadas: string[];
}

export const STATS_VAZIAS: StatsJogador = {
  partidas_jogadas: 0, vitorias: 0, derrotas: 0, empates: 0,
  gols_marcados: 0, gols_sofridos: 0, titulos: 0, campanhas_completas: 0,
  sequencia_vitorias_atual: 0, sequencia_vitorias_recorde: 0,
  sequencia_invicta_atual: 0, sequencia_invicta_recorde: 0,
  disputas_penaltis: 0, penaltis_vencidos: 0, jogadores_lendarios_escalados: 0,
  drafts_modo_classico: 0, drafts_modo_almanaque: 0,
  trocas_usadas: 0, rerolls_usados: 0, improvisacoes_total: 0,
  goleadas_5_mais: 0, jogos_sem_sofrer_gol: 0,
  formacoes_distintas_usadas: [], selecoes_distintas_usadas: [],
};

export interface Conquista {
  id: string;
  categoria: CategoriaConquista;
  tier: TierConquista;
  nome: string;
  descricao: string;
  icone: string; // nome do ícone lucide-react
  meta: number;
  getValor: (s: StatsJogador) => number;
}

const TIER_LABEL: Record<TierConquista, string> = {
  bronze: "Bronze", prata: "Prata", ouro: "Ouro", platina: "Platina", lendaria: "Lendária",
};

function gerarTiers(
  idPrefix: string,
  categoria: CategoriaConquista,
  icone: string,
  nomeBase: string,
  descricaoFn: (meta: number) => string,
  metas: number[],
  getValor: (s: StatsJogador) => number,
  tiers: TierConquista[] = ["bronze", "prata", "ouro", "platina", "lendaria"],
): Conquista[] {
  return metas.map((meta, i) => ({
    id: `${idPrefix}-${i + 1}`,
    categoria,
    tier: tiers[i] ?? "lendaria",
    nome: `${nomeBase} ${TIER_LABEL[tiers[i] ?? "lendaria"]}`,
    descricao: descricaoFn(meta),
    icone,
    meta,
    getValor,
  }));
}

export const CONQUISTAS: Conquista[] = [
  // ===== VITÓRIAS (10) =====
  ...gerarTiers("vitorias", "vitorias", "Trophy", "Vencedor",
    (m) => `Vença ${m} partida${m > 1 ? "s" : ""}.`,
    [1, 5, 15, 30, 50],
    (s) => s.vitorias),
  ...gerarTiers("vitorias-total", "vitorias", "Swords", "Veterano de Guerra",
    (m) => `Jogue ${m} partidas, vencendo ou perdendo.`,
    [10, 50, 100, 250, 500],
    (s) => s.partidas_jogadas),

  // ===== GOLS (15) =====
  ...gerarTiers("gols-marcados", "gols", "Target", "Artilheiro",
    (m) => `Marque ${m} gols no total.`,
    [5, 25, 75, 150, 300],
    (s) => s.gols_marcados),
  ...gerarTiers("goleadas", "gols", "Flame", "Goleador",
    (m) => `Vença ${m} partida${m > 1 ? "s" : ""} por 5 gols de diferença ou mais.`,
    [1, 3, 8, 15, 25],
    (s) => s.goleadas_5_mais),

  // ===== TÍTULOS (10) =====
  ...gerarTiers("titulos", "titulos", "Crown", "Campeão Mundial",
    (m) => `Conquiste ${m} título${m > 1 ? "s" : ""} de campeão.`,
    [1, 3, 7, 15, 25],
    (s) => s.titulos),
  ...gerarTiers("campanhas", "titulos", "FlagTriangleRight", "Maratonista",
    (m) => `Complete ${m} campanha${m > 1 ? "s" : ""} (até o fim, vencendo ou sendo eliminado).`,
    [1, 10, 25, 50, 100],
    (s) => s.campanhas_completas),

  // ===== SEQUÊNCIAS (10) =====
  ...gerarTiers("sequencia", "sequencias", "Zap", "Em Chamas",
    (m) => `Vença ${m} partidas seguidas.`,
    [2, 4, 7, 10, 15],
    (s) => s.sequencia_vitorias_recorde),
  ...gerarTiers("invencivel", "sequencias", "ShieldCheck", "Invencível",
    (m) => `Fique ${m} partida${m > 1 ? "s" : ""} seguida${m > 1 ? "s" : ""} sem perder (vitória ou empate).`,
    [3, 6, 10, 18, 30],
    (s) => s.sequencia_invicta_recorde),

  // ===== PÊNALTIS (10) =====
  ...gerarTiers("penaltis-disputa", "penaltis", "Target", "Frio na Marca da Cal",
    (m) => `Dispute ${m} série${m > 1 ? "s" : ""} de pênaltis.`,
    [1, 3, 8, 15, 25],
    (s) => s.disputas_penaltis),
  ...gerarTiers("penaltis-vitoria", "penaltis", "Crosshair", "Especialista em Pênaltis",
    (m) => `Vença ${m} série${m > 1 ? "s" : ""} de pênaltis.`,
    [1, 3, 6, 12, 20],
    (s) => s.penaltis_vencidos),

  // ===== DRAFT / COLEÇÃO (15) =====
  ...gerarTiers("lendarios", "draft", "Star", "Caçador de Lendas",
    (m) => `Escale ${m} jogador${m > 1 ? "es" : ""} lendário${m > 1 ? "s" : ""} ao longo das campanhas.`,
    [1, 10, 30, 60, 120],
    (s) => s.jogadores_lendarios_escalados),
  ...gerarTiers("rerolls", "draft", "Dices", "Sortudo",
    (m) => `Use ${m} reroll${m > 1 ? "s" : ""} durante o draft.`,
    [1, 5, 15, 30, 50],
    (s) => s.rerolls_usados),
  ...gerarTiers("trocas", "draft", "Repeat", "Treinador Exigente",
    (m) => `Use ${m} troca${m > 1 ? "s" : ""} de jogador no draft.`,
    [1, 5, 15, 30, 50],
    (s) => s.trocas_usadas),

  // ===== MODOS (10) =====
  ...gerarTiers("classico", "modos", "BookOpen", "Tradicionalista",
    (m) => `Complete ${m} draft${m > 1 ? "s" : ""} no modo Clássico.`,
    [1, 5, 15, 30, 50],
    (s) => s.drafts_modo_classico),
  ...gerarTiers("almanaque", "modos", "HelpCircle", "Mestre do Almanaque",
    (m) => `Complete ${m} draft${m > 1 ? "s" : ""} no modo Almanaque (sem ver a força).`,
    [1, 5, 15, 30, 50],
    (s) => s.drafts_modo_almanaque),

  // ===== VARIEDADE (10) =====
  ...gerarTiers("formacoes", "variedade", "LayoutGrid", "Estrategista",
    (m) => `Jogue com ${m} formaç${m > 1 ? "ões" : "ão"} tática${m > 1 ? "s" : ""} diferente${m > 1 ? "s" : ""}.`,
    [2, 4, 6, 8, 10],
    (s) => s.formacoes_distintas_usadas.length),
  ...gerarTiers("selecoes", "variedade", "Globe", "Colecionador de Seleções",
    (m) => `Use jogadores de ${m} seleções diferentes ao longo das campanhas.`,
    [3, 8, 15, 25, 40],
    (s) => s.selecoes_distintas_usadas.length),

  // ===== DEFESA (10) =====
  ...gerarTiers("clean-sheet", "defesa", "ShieldHalf", "Muralha",
    (m) => `Termine ${m} partida${m > 1 ? "s" : ""} sem sofrer gols.`,
    [1, 5, 12, 25, 40],
    (s) => s.jogos_sem_sofrer_gol),
  ...gerarTiers("improvisacao", "defesa", "Shuffle", "Mestre da Improvisação",
    (m) => `Vença ${m} partida${m > 1 ? "s" : ""} escalando jogadores improvisados fora de posição.`,
    [1, 5, 12, 25, 40],
    (s) => s.improvisacoes_total),

  // ===== ESPECIAIS (10) =====
  ...gerarTiers("empates", "especiais", "Equal", "Equilíbrio Perfeito",
    (m) => `Empate ${m} partida${m > 1 ? "s" : ""}.`,
    [1, 5, 10, 20, 35],
    (s) => s.empates),
];

// Garantia em tempo de desenvolvimento de que temos exatamente 100 conquistas
if (CONQUISTAS.length !== 100) {
  // eslint-disable-next-line no-console
  console.warn(`[conquistas] Esperado 100 conquistas, encontrado ${CONQUISTAS.length}.`);
}

export interface ConquistaComProgresso extends Conquista {
  valorAtual: number;
  desbloqueada: boolean;
  progresso: number; // 0 a 1
}

export function calcularProgresso(stats: StatsJogador, desbloqueadasIds: Set<string>): ConquistaComProgresso[] {
  return CONQUISTAS.map(c => {
    const valorAtual = c.getValor(stats);
    const desbloqueada = desbloqueadasIds.has(c.id) || valorAtual >= c.meta;
    return {
      ...c,
      valorAtual,
      desbloqueada,
      progresso: Math.min(1, valorAtual / c.meta),
    };
  });
}

export function novasConquistas(stats: StatsJogador, desbloqueadasIds: Set<string>): Conquista[] {
  return CONQUISTAS.filter(c => !desbloqueadasIds.has(c.id) && c.getValor(stats) >= c.meta);
}
