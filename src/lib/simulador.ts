// ============================================================
// Motor de simulação de partida
// ============================================================
import type { Jogador, Selecao, Posicao } from "./selecoes";
import { SELECOES, grupoDe, posicoesCompativeis, sortearPoolJogadores } from "./selecoes";
import type { Formacao } from "./formacoes";

export type Estrategia = "ofensiva" | "defensiva" | "equilibrada";

export interface JogadorEscalado extends Jogador {
  slotId: string;
  improvisado: boolean;
  forcaEfetiva: number;
}

export interface Time {
  nome: string;
  bandeira: string;
  formacao: Formacao;
  estrategia: Estrategia;
  escalacao: JogadorEscalado[];
  isCPU: boolean;
}

export interface EventoJogo {
  minuto: number;
  tipo: "gol" | "chance" | "cartao" | "subst" | "info";
  texto: string;
  time?: "casa" | "fora";
}

export interface ResultadoPartida {
  golsCasa: number;
  golsFora: number;
  eventos: EventoJogo[];
}

// Pesos de ataque/defesa por estratégia, conforme solicitado:
//   Defensiva:   70% defesa / 30% ataque
//   Equilibrada: 50% defesa / 50% ataque
//   Ofensiva:    30% defesa / 70% ataque
const PESOS_ESTRATEGIA: Record<Estrategia, { ataque: number; defesa: number }> = {
  defensiva:   { ataque: 0.30, defesa: 0.70 },
  equilibrada: { ataque: 0.50, defesa: 0.50 },
  ofensiva:    { ataque: 0.70, defesa: 0.30 },
};

// ataque/defesa por time: a força bruta de cada setor (média de força dos
// jogadores daquele grupo) é escalada pelo peso da estratégia. Em "equilibrada"
// (peso 0.5) o resultado é exatamente a força bruta do setor — comportamento
// neutro. Em "ofensiva" (peso 0.7) o ataque sobe e a defesa cai na mesma
// proporção, e vice-versa em "defensiva".
function poderes(t: Time) {
  const atkBruto = avg(t.escalacao.filter(p => { const g = grupoDe(p.posicao); return g === "ATA" || g === "MEI"; }), "forcaEfetiva");
  const defBruto = avg(t.escalacao.filter(p => { const g = grupoDe(p.posicao); return g === "DEF" || g === "GOL"; }), "forcaEfetiva");
  const pesos = PESOS_ESTRATEGIA[t.estrategia];
  // peso 0.5 → fator 1.0 (neutro) | peso 0.7 → fator 1.4 | peso 0.3 → fator 0.6
  const fatorAtaque = pesos.ataque * 2;
  const fatorDefesa = pesos.defesa * 2;
  return {
    ataque: atkBruto * fatorAtaque,
    defesa: defBruto * fatorDefesa,
  };
}

function avg<T extends Record<string, any>>(arr: T[], key: keyof T): number {
  if (!arr.length) return 60;
  return arr.reduce((a, x) => a + Number(x[key]), 0) / arr.length;
}

// Resultado rápido (sem log de eventos minuto-a-minuto) usado para simular confrontos
// entre dois times CPU na fase de grupos, baseado diretamente nos poderes de
// ataque/defesa (já pesados pela estratégia escolhida por cada time).
export function simularPlacarRapido(casa: Time, fora: Time): { golsCasa: number; golsFora: number } {
  const rng = Math.random;
  const pc = poderes(casa);
  const pf = poderes(fora);
  let golsCasa = 0, golsFora = 0;
  for (let min = 1; min <= 90; min++) {
    if (rng() < 0.08) {
      const atacaCasa = rng() < 0.5 + (pc.ataque - pf.ataque) / 400;
      const ataq = atacaCasa ? pc.ataque : pf.ataque;
      const def = atacaCasa ? pf.defesa : pc.defesa;
      const chanceGol = clamp01((ataq - def) / 60 + 0.18);
      if (rng() < chanceGol) {
        if (atacaCasa) golsCasa++; else golsFora++;
      }
    }
  }
  return { golsCasa, golsFora };
}

export function simularPartida(casa: Time, fora: Time, seed = Math.random()): ResultadoPartida {
  const rng = mulberry32(Math.floor(seed * 1e9));
  const pc = poderes(casa);
  const pf = poderes(fora);

  const eventos: EventoJogo[] = [
    { minuto: 0, tipo: "info", texto: `🟢 Bola rolando — ${casa.nome} ${casa.bandeira} x ${fora.bandeira} ${fora.nome}` },
  ];
  let golsCasa = 0, golsFora = 0;

  for (let min = 1; min <= 90; min++) {
    // chance de evento por minuto ~ 8%
    if (rng() < 0.08) {
      const atacaCasa = rng() < 0.5 + (pc.ataque - pf.ataque) / 400;
      const ataq = atacaCasa ? pc.ataque : pf.ataque;
      const def = atacaCasa ? pf.defesa : pc.defesa;
      const t = atacaCasa ? casa : fora;
      const lado = atacaCasa ? "casa" : "fora";
      const chanceGol = clamp01((ataq - def) / 60 + 0.18);
      if (rng() < chanceGol) {
        const artilheiro = pickAtacante(t, rng);
        if (atacaCasa) golsCasa++; else golsFora++;
        // ~12% das chances que viram gol são de pênalti — marca no texto pra
        // o resumo pós-jogo conseguir mostrar a tag "PEN" abaixo do placar.
        const dePenalti = rng() < 0.12;
        eventos.push({
          minuto: min, tipo: "gol", time: lado,
          texto: dePenalti
            ? `⚽ ${min}' GOL de pênalti do ${t.nome}! ${artilheiro.nome} (${artilheiro.forca}) marca. ${golsCasa}x${golsFora}`
            : `⚽ ${min}' GOL do ${t.nome}! ${artilheiro.nome} (${artilheiro.forca}) marca. ${golsCasa}x${golsFora}`,
        });
      } else {
        eventos.push({
          minuto: min, tipo: "chance", time: lado,
          texto: `${min}' Chance de ${t.nome} desperdiçada.`,
        });
      }
    }
    if (min === 45) eventos.push({ minuto: 45, tipo: "info", texto: `⏸️ Fim do 1º tempo. ${golsCasa} x ${golsFora}` });
    if (min === 46) eventos.push({ minuto: 46, tipo: "info", texto: `▶️ Começa o 2º tempo.` });
    if (min === 60 && rng() < 0.5) {
      eventos.push({ minuto: 60, tipo: "subst", texto: `🔁 ${rng() < 0.5 ? casa.nome : fora.nome} faz uma substituição.` });
    }
    if (rng() < 0.01) {
      const t = rng() < 0.5 ? casa : fora;
      eventos.push({ minuto: min, tipo: "cartao", texto: `🟨 ${min}' Cartão amarelo para ${t.nome}.` });
    }
  }
  eventos.push({ minuto: 90, tipo: "info", texto: `🏁 Fim de jogo. ${casa.nome} ${golsCasa} x ${golsFora} ${fora.nome}` });
  return { golsCasa, golsFora, eventos };
}

function pickAtacante(t: Time, rng: () => number): JogadorEscalado {
  const atacantes = t.escalacao.filter(p => { const g = grupoDe(p.posicao); return g === "ATA" || g === "MEI"; });
  const pool = atacantes.length ? atacantes : t.escalacao;
  // peso por força
  const weights = pool.map(p => p.forcaEfetiva);
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[0]!;
}

function clamp01(v: number) { return Math.max(0.02, Math.min(0.7, v)); }

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === CPU: monta time automaticamente sorteando jogadores de várias seleções,
// do mesmo jeito que o jogador monta o seu time — sem usar o "11 titular" fixo
// de uma única seleção do JSON. O NOME e a BANDEIRA do time, porém, vêm de uma
// seleção real cadastrada (ex: "Brasil", "França"), só emprestando identidade
// visual — o elenco em campo continua sendo sorteado livremente.
function nomesDePaisesDisponiveis(): { nome: string; bandeira: string }[] {
  const vistos = new Set<string>();
  const unicos: { nome: string; bandeira: string }[] = [];
  for (const sel of SELECOES) {
    if (vistos.has(sel.nome)) continue;
    vistos.add(sel.nome);
    unicos.push({ nome: sel.nome, bandeira: sel.bandeira });
  }
  return unicos;
}

export function montarTimeCPU(formacao: Formacao, bonusForca = 0): Time {
  const pool = sortearPoolJogadores(8);
  const escalacao = escalarAutomaticamente(pool, formacao, bonusForca);
  const estrategias: Estrategia[] = ["ofensiva", "defensiva", "equilibrada"];
  const paises = nomesDePaisesDisponiveis();
  const pais = paises[Math.floor(Math.random() * paises.length)]!;
  return {
    nome: pais.nome, bandeira: pais.bandeira, formacao,
    estrategia: estrategias[Math.floor(Math.random() * 3)]!,
    escalacao, isCPU: true,
  };
}

// Monta vários times CPU de uma vez garantindo nomes de país únicos entre eles
// (usado para montar o chaveamento inteiro do torneio com 31 adversários distintos).
export function montarVariosTimesCPU(formacao: Formacao, qtd: number, bonusForca = 0): Time[] {
  const paisesDisponiveis = nomesDePaisesDisponiveis().sort(() => Math.random() - 0.5);
  const times: Time[] = [];
  for (let i = 0; i < qtd; i++) {
    const pool = sortearPoolJogadores(8);
    const escalacao = escalarAutomaticamente(pool, formacao, bonusForca);
    const estrategias: Estrategia[] = ["ofensiva", "defensiva", "equilibrada"];
    // Se a quantidade de adversários exceder o número de países distintos
    // disponíveis (não deve acontecer com 263 seleções/263 países no banco),
    // reaproveita a lista com um sufixo numérico para não quebrar a unicidade visual.
    const paisBase = paisesDisponiveis[i % paisesDisponiveis.length]!;
    const nome = i < paisesDisponiveis.length ? paisBase.nome : `${paisBase.nome} ${Math.floor(i / paisesDisponiveis.length) + 1}`;
    times.push({
      nome, bandeira: paisBase.bandeira, formacao,
      estrategia: estrategias[Math.floor(Math.random() * 3)]!,
      escalacao, isCPU: true,
    });
  }
  return times;
}

// Ordem de preenchimento: das posições mais "restritas" (menos jogadores costumam
// existir naquele grupo) para as mais "largas", evitando que um slot largo (ex: MEI)
// roube por engano o único jogador de um slot mais restrito (ex: VOL).
const ORDEM_PREENCHIMENTO: Posicao[] = ["GOL", "ZAG", "LD", "LE", "VOL", "MC", "MEI", "CA", "ATA"];

export function escalarAutomaticamente(poolOuSelecao: Jogador[] | Selecao, formacao: Formacao, bonus = 0): JogadorEscalado[] {
  const poolOriginal = Array.isArray(poolOuSelecao) ? poolOuSelecao : poolOuSelecao.jogadores;
  const restantes = [...poolOriginal];
  const porSlot = new Map<string, JogadorEscalado>();
  const slotsOrdenados = [...formacao.slots].sort(
    (a, b) => ORDEM_PREENCHIMENTO.indexOf(a.posicao) - ORDEM_PREENCHIMENTO.indexOf(b.posicao),
  );
  for (const slot of slotsOrdenados) {
    const grupoSlot = grupoDe(slot.posicao);
    const posicoesAceitas = posicoesCompativeis(slot.posicao);
    const candidatos = restantes
      .map((p, i) => {
        const mesmaPosicao = posicoesAceitas.includes(p.posicao);
        const mesmoGrupo = grupoDe(p.posicao) === grupoSlot;
        // prioridade: posição exata/compatível > mesmo grupo (DEF/MEI/ATA/GOL) > resto
        const score = (mesmaPosicao ? 2000 : 0) + (mesmoGrupo ? 1000 : 0) + p.forca;
        return { p, i, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = candidatos[0]!;
    const p = best.p;
    restantes.splice(best.i, 1);
    const improvisado = !posicoesAceitas.includes(p.posicao);
    porSlot.set(slot.id, {
      ...p, slotId: slot.id, improvisado,
      forcaEfetiva: Math.max(40, p.forca + bonus + (improvisado ? -10 : 0)),
    });
  }
  // devolve na ordem original dos slots da formação (não na ordem de preenchimento)
  return formacao.slots.map(slot => porSlot.get(slot.id)!);
}

export function rankingForca(t: Time): number {
  if (!t.escalacao.length) return 0;
  return Math.round(t.escalacao.reduce((a, p) => a + p.forcaEfetiva, 0) / t.escalacao.length);
}

// === Médias para exibição ===
export interface StatsTime { forca: number; ataque: number; defesa: number; }

export function statsTime(t: Pick<Time, "escalacao">): StatsTime {
  return statsEscalacao(t.escalacao);
}

export function statsEscalacao(escalacao: JogadorEscalado[]): StatsTime {
  if (!escalacao.length) return { forca: 0, ataque: 0, defesa: 0 };
  const ata = escalacao.filter(p => { const g = grupoDe(p.posicao); return g === "ATA" || g === "MEI"; });
  const def = escalacao.filter(p => { const g = grupoDe(p.posicao); return g === "DEF" || g === "GOL"; });
  const avgKey = (arr: JogadorEscalado[]) =>
    arr.length ? Math.round(arr.reduce((a, p) => a + p.forcaEfetiva, 0) / arr.length) : 0;
  return {
    forca: Math.round(escalacao.reduce((a, p) => a + p.forcaEfetiva, 0) / escalacao.length),
    ataque: avgKey(ata),
    defesa: avgKey(def),
  };
}

// === Pênaltis (desempate de mata-mata) ===
export interface CobrancaPenalti {
  rodada: number;
  time: "casa" | "fora";
  jogador: string;
  acertou: boolean;
  placarCasa: number;
  placarFora: number;
}

export interface ResultadoPenaltis {
  golsCasa: number;
  golsFora: number;
  cobrancas: CobrancaPenalti[];
}

function pickBatedor(t: Time, jaUsados: Set<string>, rng: () => number): JogadorEscalado {
  const disponiveis = t.escalacao.filter(p => !jaUsados.has(p.slotId));
  const pool = disponiveis.length ? disponiveis : t.escalacao;
  const ordenado = [...pool].sort((a, b) => b.forcaEfetiva - a.forcaEfetiva);
  // entre os melhores, sorteia com leve viés pros mais fortes
  const idx = Math.min(ordenado.length - 1, Math.floor(rng() * rng() * ordenado.length));
  return ordenado[idx]!;
}

export function simularPenaltis(casa: Time, fora: Time): ResultadoPenaltis {
  const rng = Math.random;
  const clampPen = (v: number) => Math.max(0.55, Math.min(0.92, v));
  const probCasa = clampPen(0.72 + (statsTime(casa).ataque - 75) / 250);
  const probFora = clampPen(0.72 + (statsTime(fora).ataque - 75) / 250);
  let gc = 0, gf = 0;
  const cobrancas: CobrancaPenalti[] = [];
  const usadosCasa = new Set<string>();
  const usadosFora = new Set<string>();

  const cobrar = (rodada: number) => {
    const batCasa = pickBatedor(casa, usadosCasa, rng);
    usadosCasa.add(batCasa.slotId);
    const acertouCasa = rng() < probCasa;
    if (acertouCasa) gc++;
    cobrancas.push({ rodada, time: "casa", jogador: batCasa.nome, acertou: acertouCasa, placarCasa: gc, placarFora: gf });

    const batFora = pickBatedor(fora, usadosFora, rng);
    usadosFora.add(batFora.slotId);
    const acertouFora = rng() < probFora;
    if (acertouFora) gf++;
    cobrancas.push({ rodada, time: "fora", jogador: batFora.nome, acertou: acertouFora, placarCasa: gc, placarFora: gf });
  };

  for (let i = 1; i <= 5; i++) cobrar(i);
  let rodada = 6;
  while (gc === gf) {
    cobrar(rodada);
    rodada++;
    if (rodada > 30) break; // segurança contra loop infinito
  }
  return { golsCasa: gc, golsFora: gf, cobrancas };
}
