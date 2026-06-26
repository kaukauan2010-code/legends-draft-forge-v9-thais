// ============================================================
// FASE 3 — Torneio online: server functions.
//
// Mesmo padrão de draft-online.functions.ts:
//   - import dinâmico de supabaseAdmin (service role nunca vaza pro browser)
//   - toda mutação validada no servidor contra o estado real do banco
//   - client só tem GRANT de SELECT em torneio_online e partida_online
//
// Fluxo:
//   1. iniciarTorneioOnline  → copia elencos do draft, gera grupos + chaveamento,
//                              muda sala.status para 'torneio'.
//   2. simularPartidaOnline  → roda simulador no servidor, grava resultado canônico
//                              em partida_online (log_eventos + penaltis + placar).
//   3. avancarFaseOnline     → fecha rodada/fase, gera próximos confrontos no
//                              chaveamento, avança torneio_online.fase_atual.
// ============================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Estrategia, JogadorEscalado, Time } from "@/lib/simulador";
import {
  simularPartida, simularPlacarRapido, simularPenaltis,
  montarVariosTimesCPU,
} from "@/lib/simulador";
import { FORMACOES, type FormacaoId } from "@/lib/formacoes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---------- tipos internos ----------

/** Slot de grupo gravado em torneio_online.grupos */
export interface SlotGrupo {
  slot_id: string;      // sala_jogadores.id
  user_id: string | null;
  nome: string;
  is_cpu: boolean;
  grupo: string;        // "A"–"H"
}

/** Confronto gravado em torneio_online.chaveamento */
export interface ConfrontoOnline {
  id: string;
  fase: string;         // 'oitavas' | 'quartas' | 'semi' | 'final'
  slot1_id: string;     // slot_id do "casa"
  slot2_id: string;     // slot_id do "fora"
  vencedor_slot_id: string | null;
  partida_online_id: string | null;
  /** Quando o confronto ficou disponível para os jogadores (ISO timestamp). Início do prazo de 30s. */
  disponivel_em?: string | null;
  /** Slot1 já clicou em "estou pronto" (CPU = true automaticamente). */
  slot1_pronto?: boolean;
  /** Slot2 já clicou em "estou pronto" (CPU = true automaticamente). */
  slot2_pronto?: boolean;
}

/** Linha de classificação em torneio_online.classificacao_grupos */
interface ClassifLinha {
  pontos: number;
  gols_pro: number;
  gols_contra: number;
  jogos: number;
}

const NOMES_GRUPOS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Prazo (ms) que cada jogador tem para confirmar pronto antes de levar WO. */
const PRAZO_PRONTO_MS = 30_000;

// ---------- helpers ----------

async function exigirMestre(admin: AdminClient, salaId: string, userId: string) {
  const { data } = await admin
    .from("salas")
    .select("id, mestre_id, status")
    .eq("id", salaId)
    .maybeSingle();
  if (!data) throw new Error("Sala não encontrada.");
  if (data.mestre_id !== userId) throw new Error("Só o mestre pode avançar o torneio.");
  return data as { id: string; mestre_id: string; status: string };
}

async function exigirMembro(admin: AdminClient, salaId: string, userId: string) {
  const { data } = await admin
    .from("sala_jogadores")
    .select("id, is_cpu")
    .eq("sala_id", salaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.is_cpu) throw new Error("Você não é membro humano desta sala.");
  return data as { id: string; is_cpu: boolean };
}

/** Aplica metadados de "pronto/disponivel" a uma lista de confrontos novos.
 * Confrontos com pelo menos um lado CPU já marcam aquele lado como pronto.
 * disponivel_em é setado para agora (início do prazo de 30s). */
function aplicarMetaConfrontos(
  confrontos: ConfrontoOnline[],
  slotsInfo: Map<string, { is_cpu: boolean }>,
): ConfrontoOnline[] {
  const agora = new Date().toISOString();
  return confrontos.map(c => ({
    ...c,
    disponivel_em: c.disponivel_em ?? agora,
    slot1_pronto: c.slot1_pronto ?? !!slotsInfo.get(c.slot1_id)?.is_cpu,
    slot2_pronto: c.slot2_pronto ?? !!slotsInfo.get(c.slot2_id)?.is_cpu,
  }));
}

async function buscarTorneio(admin: AdminClient, salaId: string) {
  const { data } = await admin
    .from("torneio_online")
    .select("*")
    .eq("sala_id", salaId)
    .maybeSingle();
  if (!data) throw new Error("Torneio não iniciado para esta sala.");
  return data;
}

/** Monta um Time a partir do elenco gravado no banco para uso no simulador. */
function montar_time_from_slot(
  slot: { nome: string; is_cpu: boolean; elenco_online: JogadorEscalado[] | null },
  formacaoId: FormacaoId,
  estrategia: Estrategia,
): Time {
  if (slot.is_cpu || !slot.elenco_online?.length) {
    // CPU: gera elenco automaticamente com -15 de bônus (padrão solo)
    const t = montarVariosTimesCPU(FORMACOES[formacaoId] ?? FORMACOES["4-3-3"], 1, -15)[0]!;
    return { ...t, nome: slot.nome };
  }
  return {
    nome: slot.nome,
    bandeira: "🏆",
    formacao: FORMACOES[formacaoId] ?? FORMACOES["4-3-3"],
    estrategia,
    escalacao: slot.elenco_online,
    isCPU: false,
  };
}

/** Distribuição uniforme (round-robin) pelos 8 grupos.
 *  Regra do jogo: 8 jogadores → 1 por grupo; 16 → 2 por grupo; 32 → 4 por grupo.
 *  Quantidade ímpar começa pelo grupo A (i % 8). */
function gerarGrupos(slots: { id: string; user_id: string | null; nome: string; is_cpu: boolean }[]): SlotGrupo[] {
  const embaralhados = [...slots].sort(() => Math.random() - 0.5);
  return embaralhados.map((s, i) => ({
    slot_id: s.id,
    user_id: s.user_id,
    nome: s.nome,
    is_cpu: s.is_cpu,
    grupo: NOMES_GRUPOS[i % NOMES_GRUPOS.length] ?? "A",
  }));
}

/** Gera a chave das oitavas a partir dos top-2 de cada grupo.
 *  Cruzamento clássico Copa do Mundo: 1°A × 2°B, 1°B × 2°A, etc. */
function gerarOitavas(
  classificados: { grupo: string; slot_id: string }[],
): ConfrontoOnline[] {
  // classif[i] = [1°, 2°] do grupo NOMES_GRUPOS[i]
  const classifPorGrupo: { slot_id: string }[][] = NOMES_GRUPOS.map(g =>
    classificados.filter(c => c.grupo === g),
  );

  const confrontos: ConfrontoOnline[] = [];
  // pares de grupos: (A,B), (C,D), (E,F), (G,H)
  for (let gi = 0; gi < 8; gi += 2) {
    const pri = classifPorGrupo[gi] ?? [];
    const sec = classifPorGrupo[gi + 1] ?? [];
    confrontos.push({
      id: `oitavas-${gi}-1`,
      fase: "oitavas",
      slot1_id: pri[0]?.slot_id ?? "",
      slot2_id: sec[1]?.slot_id ?? "",
      vencedor_slot_id: null,
      partida_online_id: null,
    });
    confrontos.push({
      id: `oitavas-${gi}-2`,
      fase: "oitavas",
      slot1_id: sec[0]?.slot_id ?? "",
      slot2_id: pri[1]?.slot_id ?? "",
      vencedor_slot_id: null,
      partida_online_id: null,
    });
  }
  return confrontos;
}

// Classifica dentro de um grupo lendo a classificacao_grupos do torneio
function classificarGrupo(
  grupo: string,
  slots: SlotGrupo[],
  classif: Record<string, ClassifLinha>,
): SlotGrupo[] {
  const doGrupo = slots.filter(s => s.grupo === grupo);
  return doGrupo.sort((a, b) => {
    const ca = classif[a.slot_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
    const cb = classif[b.slot_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
    return (cb.pontos - ca.pontos)
      || ((cb.gols_pro - cb.gols_contra) - (ca.gols_pro - ca.gols_contra))
      || (cb.gols_pro - ca.gols_pro);
  });
}

// ---------- validators ----------

const SalaIdInput = z.object({ salaId: z.string().uuid() });

const SimularInput = z.object({
  salaId: z.string().uuid(),
  confrontoId: z.string(),
});

// ---------- server functions ----------

/**
 * Iniciado pelo MESTRE quando todos terminaram o draft.
 * - Lê os elencos finais de sala_draft.escolhas
 * - Copia para sala_jogadores.elenco_online (inclui formação/estratégia/nome do time)
 * - Gera 8 grupos de 4, preenchendo slots de CPU onde precisar
 * - Cria torneio_online com grupos e classificação zerada
 * - Muda sala.status para 'torneio'
 */
export const iniciarTorneioOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SalaIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMestre(admin, data.salaId, userId);

    // 1. Busca sala
    const { data: sala } = await admin
      .from("salas")
      .select("id, modo, competicao, max_jogadores, status")
      .eq("id", data.salaId)
      .maybeSingle();
    if (!sala) throw new Error("Sala não encontrada.");
    if (sala.status !== "draft") throw new Error("A sala não está na fase de draft.");

    // 2. Busca todos os sala_jogadores (humanos + CPU)
    const { data: sjRows } = await admin
      .from("sala_jogadores")
      .select("id, user_id, nome, is_cpu, slot, grupo")
      .eq("sala_id", data.salaId)
      .order("slot");
    const slots: { id: string; user_id: string | null; nome: string; is_cpu: boolean; slot: number }[] =
      (sjRows ?? []);

    // 3. Para cada humano, copia escolhas do sala_draft → elenco_online
    const { data: drafts } = await admin
      .from("sala_draft")
      .select("user_id, escolhas, formacao_id, estrategia, nome_time, terminou")
      .eq("sala_id", data.salaId);

    const draftPorUser = new Map(
      ((drafts ?? []) as {
        user_id: string; escolhas: JogadorEscalado[];
        formacao_id: string; estrategia: Estrategia;
        nome_time: string; terminou: boolean;
      }[]).map(d => [d.user_id, d]),
    );

    for (const sj of slots) {
      if (sj.is_cpu || !sj.user_id) continue;
      const draft = draftPorUser.get(sj.user_id);
      if (!draft?.terminou) continue;
      await admin
        .from("sala_jogadores")
        .update({
          elenco_online: draft.escolhas,
          nome: draft.nome_time || sj.nome,
        })
        .eq("id", sj.id);
    }

    const { data: slotsAtualizados } = await admin
      .from("sala_jogadores")
      .select("id, user_id, nome, is_cpu, slot")
      .eq("sala_id", data.salaId)
      .order("slot");
    const todosSlots: { id: string; user_id: string | null; nome: string; is_cpu: boolean }[] =
      slotsAtualizados ?? [];

    const maxJogadores = sala.max_jogadores;
    const competicao = sala.competicao as "copa" | "oitavas" | "final";

    // Pad com CPU se faltar (defesa - o lobby já deveria ter preenchido)
    const extras: { id: string; user_id: null; nome: string; is_cpu: boolean }[] = [];
    if (todosSlots.length < maxJogadores) {
      const filler = montarVariosTimesCPU(FORMACOES["4-3-3"], maxJogadores - todosSlots.length, -15);
      for (let i = 0; i < filler.length; i++) {
        extras.push({ id: `cpu-filler-${i}`, user_id: null, nome: filler[i]!.nome, is_cpu: true });
      }
    }
    const todos = [...todosSlots, ...extras].slice(0, maxJogadores);

    const slotsInfo = new Map<string, { is_cpu: boolean }>(
      todos.map(s => [s.id, { is_cpu: s.is_cpu }]),
    );

    // ─── ROTA A: competicao = 'final' (1x1) ───
    if (competicao === "final") {
      if (todos.length < 2) throw new Error("Precisa de 2 jogadores no mínimo.");
      const [s1, s2] = todos;
      const confronto: ConfrontoOnline = {
        id: "final-1",
        fase: "final",
        slot1_id: s1!.id,
        slot2_id: s2!.id,
        vencedor_slot_id: null,
        partida_online_id: null,
      };
      const chaveamento = aplicarMetaConfrontos([confronto], slotsInfo);
      const { error: errT } = await admin.from("torneio_online").insert({
        sala_id: data.salaId,
        fase_atual: "final",
        rodada_grupos_atual: 1,
        grupos: [],
        chaveamento,
        classificacao_grupos: {},
      });
      if (errT) throw new Error(errT.message);
      await admin.from("salas").update({ status: "torneio" }).eq("id", data.salaId);
      return { ok: true };
    }

    // ─── ROTA B: competicao = 'oitavas' (16 jogadores, direto pro mata-mata) ───
    if (competicao === "oitavas") {
      const embaralhados = [...todos].sort(() => Math.random() - 0.5);
      const confrontosBruto: ConfrontoOnline[] = [];
      for (let i = 0; i < embaralhados.length; i += 2) {
        confrontosBruto.push({
          id: `oitavas-${i / 2 + 1}`,
          fase: "oitavas",
          slot1_id: embaralhados[i]!.id,
          slot2_id: embaralhados[i + 1]!.id,
          vencedor_slot_id: null,
          partida_online_id: null,
        });
      }
      const chaveamento = aplicarMetaConfrontos(confrontosBruto, slotsInfo);
      const { error: errT } = await admin.from("torneio_online").insert({
        sala_id: data.salaId,
        fase_atual: "oitavas",
        rodada_grupos_atual: 1,
        grupos: [],
        chaveamento,
        classificacao_grupos: {},
      });
      if (errT) throw new Error(errT.message);
      await admin.from("salas").update({ status: "torneio" }).eq("id", data.salaId);
      return { ok: true };
    }

    // ─── ROTA C: competicao = 'copa' (32, com fase de grupos) ───
    const grupos = gerarGrupos(todos);

    const classif: Record<string, ClassifLinha> = {};
    for (const g of grupos) {
      classif[g.slot_id] = { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
    }

    const { error: errTorneio } = await admin.from("torneio_online").insert({
      sala_id: data.salaId,
      fase_atual: "grupos",
      rodada_grupos_atual: 1,
      grupos,
      chaveamento: [],
      classificacao_grupos: classif,
    });
    if (errTorneio) throw new Error(errTorneio.message);

    for (const g of grupos) {
      await admin
        .from("sala_jogadores")
        .update({ grupo: g.grupo })
        .eq("id", g.slot_id);
    }

    await admin.from("salas").update({ status: "torneio" }).eq("id", data.salaId);

    return { ok: true };
  });

/**
 * Roda um confronto do torneio no servidor e grava o resultado canônico.
 * - Pode ser chamado por QUALQUER humano da sala (não só o mestre).
 * - Se a partida já foi encerrada (encerrada=true), retorna o resultado existente.
 * - Suporta grupos e mata-mata; gera pênaltis automaticamente em empate de mata-mata.
 */
export const simularPartidaOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SimularInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMembro(admin, data.salaId, userId);

    const torneio = await buscarTorneio(admin, data.salaId);

    // Encontra o confronto pelo id dentro do chaveamento ou fase de grupos
    const chaveamento: ConfrontoOnline[] = torneio.chaveamento ?? [];
    const confronto = chaveamento.find((c: ConfrontoOnline) => c.id === data.confrontoId);
    if (!confronto) throw new Error("Confronto não encontrado no chaveamento.");

    // Idempotência: se já foi simulado, retorna o que já está no banco
    if (confronto.partida_online_id) {
      const { data: existente } = await admin
        .from("partida_online")
        .select("*")
        .eq("id", confronto.partida_online_id)
        .maybeSingle();
      if (existente?.encerrada) return existente;
    }

    // Guard de pronto: só simula se AMBOS os lados estão prontos.
    // (CPU é marcada como pronta automaticamente ao criar o confronto.)
    if (!confronto.slot1_pronto || !confronto.slot2_pronto) {
      throw new Error("Aguardando os dois jogadores apertarem 'estou pronto'.");
    }


    // Busca os dois slots
    const { data: slot1Row } = await admin
      .from("sala_jogadores")
      .select("id, user_id, nome, is_cpu, elenco_online")
      .eq("id", confronto.slot1_id)
      .maybeSingle();
    const { data: slot2Row } = await admin
      .from("sala_jogadores")
      .select("id, user_id, nome, is_cpu, elenco_online")
      .eq("id", confronto.slot2_id)
      .maybeSingle();
    if (!slot1Row || !slot2Row) throw new Error("Slots do confronto não encontrados.");

    // Busca draft de cada jogador para pegar formação/estratégia
    const buscarDraft = async (uid: string | null) => {
      if (!uid) return null;
      const { data: d } = await admin
        .from("sala_draft")
        .select("formacao_id, estrategia")
        .eq("sala_id", data.salaId)
        .eq("user_id", uid)
        .maybeSingle();
      return d as { formacao_id: string; estrategia: Estrategia } | null;
    };

    const draft1 = await buscarDraft(slot1Row.user_id);
    const draft2 = await buscarDraft(slot2Row.user_id);

    const time1 = montar_time_from_slot(
      slot1Row,
      (draft1?.formacao_id ?? "4-3-3") as FormacaoId,
      draft1?.estrategia ?? "equilibrada",
    );
    const time2 = montar_time_from_slot(
      slot2Row,
      (draft2?.formacao_id ?? "4-3-3") as FormacaoId,
      draft2?.estrategia ?? "equilibrada",
    );

    // Simula a partida com seed determinístico (sala_id + confronto_id)
    const seed = [...`${data.salaId}${data.confrontoId}`]
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) & 0xffffffff, 0) / 0xffffffff;
    const resultado = simularPartida(time1, time2, Math.abs(seed));

    // Pênaltis em mata-mata empatado
    let penaltis = null;
    let vencedorSlotId = confronto.slot1_id; // default: casa vence
    const golsCasa = resultado.golsCasa;
    const golsFora = resultado.golsFora;
    const isMataFase = ["oitavas", "quartas", "semi", "final"].includes(confronto.fase);

    if (golsCasa > golsFora) {
      vencedorSlotId = confronto.slot1_id;
    } else if (golsFora > golsCasa) {
      vencedorSlotId = confronto.slot2_id;
    } else if (isMataFase) {
      penaltis = simularPenaltis(time1, time2);
      vencedorSlotId = penaltis.golsCasa >= penaltis.golsFora
        ? confronto.slot1_id
        : confronto.slot2_id;
    } else {
      // Empate na fase de grupos → vencedor_id = null (ambos ganham 1 ponto)
      vencedorSlotId = null as unknown as string;
    }

    // Grava em partida_online (CPU = NULL no jogadorN_id — coluna agora aceita NULL)
    const { data: partida, error: errPartida } = await admin
      .from("partida_online")
      .insert({
        jogador1_id: slot1Row.user_id ?? null,
        jogador2_id: slot2Row.user_id ?? null,
        placar1: golsCasa,
        placar2: golsFora,
        vencedor_id: slot1Row.user_id && slot2Row.user_id
          ? (vencedorSlotId === confronto.slot1_id ? slot1Row.user_id : slot2Row.user_id)
          : null,
        sala_id: data.salaId,
        fase: confronto.fase,
        rodada: 1,
        log_eventos: resultado.eventos,
        penaltis,
        encerrada: true,
      })
      .select("*")
      .single();
    if (errPartida) throw new Error(errPartida.message);

    // Atualiza confronto no chaveamento com vencedor + partida_id
    const novoChaveamento = chaveamento.map((c: ConfrontoOnline) =>
      c.id === data.confrontoId
        ? { ...c, vencedor_slot_id: vencedorSlotId ?? null, partida_online_id: partida.id }
        : c,
    );

    // Atualiza classificação (fase de grupos)
    let novaClassif = { ...(torneio.classificacao_grupos ?? {}) } as Record<string, ClassifLinha>;
    if (confronto.fase === "grupos") {
      const c1 = novaClassif[confronto.slot1_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
      const c2 = novaClassif[confronto.slot2_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
      c1.jogos++; c2.jogos++;
      c1.gols_pro += golsCasa; c1.gols_contra += golsFora;
      c2.gols_pro += golsFora; c2.gols_contra += golsCasa;
      if (golsCasa > golsFora) { c1.pontos += 3; }
      else if (golsFora > golsCasa) { c2.pontos += 3; }
      else { c1.pontos += 1; c2.pontos += 1; }
      novaClassif = { ...novaClassif, [confronto.slot1_id]: c1, [confronto.slot2_id]: c2 };
    }

    // Persiste chaveamento e classificação atualizados
    await admin
      .from("torneio_online")
      .update({ chaveamento: novoChaveamento, classificacao_grupos: novaClassif })
      .eq("sala_id", data.salaId);

    return partida;
  });

/**
 * Avança a fase do torneio.
 * - Chamado pelo MESTRE após todos os jogos da rodada/fase atual terem sido simulados.
 * - Fase de grupos: rodada 1→2→3 → oitavas (gera confrontos mata-mata)
 * - Mata-mata: gera a próxima fase a partir dos vencedores da fase atual.
 */
export const avancarFaseOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SalaIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    // Qualquer membro humano pode disparar o avanço (auto-início entre rodadas).
    await exigirMembro(admin, data.salaId, userId);

    const torneio = await buscarTorneio(admin, data.salaId);
    const grupos: SlotGrupo[] = torneio.grupos ?? [];
    const classif: Record<string, ClassifLinha> = torneio.classificacao_grupos ?? {};
    const chaveamento: ConfrontoOnline[] = torneio.chaveamento ?? [];
    const faseAtual: string = torneio.fase_atual;
    const rodadaAtual: number = torneio.rodada_grupos_atual ?? 1;

    // Mapa de slot_id → {is_cpu} pra marcar pronto automático das CPUs nos novos confrontos.
    const { data: sjRows } = await admin
      .from("sala_jogadores")
      .select("id, is_cpu")
      .eq("sala_id", data.salaId);
    const slotsInfo = new Map<string, { is_cpu: boolean }>(
      ((sjRows ?? []) as { id: string; is_cpu: boolean }[]).map(s => [s.id, { is_cpu: s.is_cpu }]),
    );

    // ── FASE DE GRUPOS ──────────────────────────────────────────────
    if (faseAtual === "grupos") {
      const confrontosDaRodada = chaveamento.filter(
        (c: ConfrontoOnline) => c.fase === "grupos" && parseInt(c.id.split("-")[2] ?? "1") === rodadaAtual,
      );
      const pendentes = confrontosDaRodada.filter((c: ConfrontoOnline) => !c.partida_online_id);
      if (pendentes.length) {
        throw new Error(`Ainda há ${pendentes.length} jogo(s) pendente(s) nesta rodada.`);
      }

      if (rodadaAtual < 3) {
        // Idempotência: outro client pode já ter avançado a rodada.
        if (torneio.rodada_grupos_atual !== rodadaAtual) return { ok: true, proximaFase: "grupos", rodada: torneio.rodada_grupos_atual };
        await admin
          .from("torneio_online")
          .update({ rodada_grupos_atual: rodadaAtual + 1 })
          .eq("sala_id", data.salaId)
          .eq("rodada_grupos_atual", rodadaAtual);
        return { ok: true, proximaFase: "grupos", rodada: rodadaAtual + 1 };
      }

      // Rodada 3 concluída: idempotência — se oitavas já existem, sai.
      if (chaveamento.some(c => c.fase === "oitavas")) {
        return { ok: true, proximaFase: "oitavas", rodada: 1 };
      }

      const classificados: { grupo: string; slot_id: string }[] = [];
      for (const nomeGrupo of NOMES_GRUPOS) {
        const top2 = classificarGrupo(nomeGrupo, grupos, classif).slice(0, 2);
        for (const s of top2) classificados.push({ grupo: nomeGrupo, slot_id: s.slot_id });
      }
      const oitavas = aplicarMetaConfrontos(gerarOitavas(classificados), slotsInfo);

      await admin
        .from("torneio_online")
        .update({
          fase_atual: "oitavas",
          chaveamento: [...chaveamento, ...oitavas],
        })
        .eq("sala_id", data.salaId);
      return { ok: true, proximaFase: "oitavas", rodada: 1 };
    }

    // ── MATA-MATA ────────────────────────────────────────────────────
    const fasesMata = ["oitavas", "quartas", "semi", "final"] as const;
    type FaseMata = (typeof fasesMata)[number];
    const proxFase: Record<FaseMata, string | null> = {
      oitavas: "quartas",
      quartas: "semi",
      semi: "final",
      final: "encerrado",
    };

    if (!fasesMata.includes(faseAtual as FaseMata)) {
      throw new Error(`Fase inválida para avançar: ${faseAtual}`);
    }

    const confrontosFase = chaveamento.filter((c: ConfrontoOnline) => c.fase === faseAtual);
    const naoEncerrados = confrontosFase.filter((c: ConfrontoOnline) => !c.vencedor_slot_id);
    if (naoEncerrados.length) {
      throw new Error(`Há ${naoEncerrados.length} confronto(s) sem resultado nesta fase.`);
    }

    const proximaFase = proxFase[faseAtual as FaseMata];
    if (proximaFase === "encerrado") {
      // Idempotência
      if (torneio.fase_atual === "encerrado") return { ok: true, proximaFase: "encerrado" };
      await admin
        .from("torneio_online")
        .update({ fase_atual: "encerrado" })
        .eq("sala_id", data.salaId);
      await admin.from("salas").update({ status: "finalizada" }).eq("id", data.salaId);
      return { ok: true, proximaFase: "encerrado" };
    }

    // Idempotência: se a próxima fase já tem confrontos, sai sem regerar.
    if (chaveamento.some(c => c.fase === proximaFase)) {
      return { ok: true, proximaFase };
    }

    // Monta confrontos da fase seguinte a partir dos vencedores
    const vencedores = confrontosFase.map((c: ConfrontoOnline) => c.vencedor_slot_id!);
    const novosBruto: ConfrontoOnline[] = [];
    for (let i = 0; i < vencedores.length; i += 2) {
      novosBruto.push({
        id: `${proximaFase}-${i / 2 + 1}`,
        fase: proximaFase!,
        slot1_id: vencedores[i]!,
        slot2_id: vencedores[i + 1]!,
        vencedor_slot_id: null,
        partida_online_id: null,
      });
    }
    const novosConfrontos = aplicarMetaConfrontos(novosBruto, slotsInfo);

    await admin
      .from("torneio_online")
      .update({
        fase_atual: proximaFase,
        chaveamento: [...chaveamento, ...novosConfrontos],
      })
      .eq("sala_id", data.salaId);

    return { ok: true, proximaFase };
  });


/**
 * Gera os confrontos da rodada atual de grupos para a sala.
 * Cada rodada tem N/2 confrontos (round-robin por grupo).
 * Chamado pelo mestre ao abrir cada rodada — idempotente (não re-cria se já existir).
 */
export const gerarRodadaGrupos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SalaIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    // Qualquer membro pode disparar a geração (idempotente).
    await exigirMembro(admin, data.salaId, userId);

    const torneio = await buscarTorneio(admin, data.salaId);
    if (torneio.fase_atual !== "grupos") throw new Error("Não está na fase de grupos.");

    const rodada: number = torneio.rodada_grupos_atual ?? 1;
    const chaveamento: ConfrontoOnline[] = torneio.chaveamento ?? [];
    const grupos: SlotGrupo[] = torneio.grupos ?? [];

    const jaExistem = chaveamento.some(
      (c: ConfrontoOnline) => c.fase === "grupos" && parseInt(c.id.split("-")[2] ?? "1") === rodada,
    );
    if (jaExistem) return { ok: true, confrontos: chaveamento.filter((c: ConfrontoOnline) => c.fase === "grupos") };

    const pares: [number, number][] = rodada === 1 ? [[0, 1], [2, 3]] : rodada === 2 ? [[0, 2], [1, 3]] : [[0, 3], [1, 2]];

    const slotsInfo = new Map<string, { is_cpu: boolean }>(
      grupos.map(g => [g.slot_id, { is_cpu: g.is_cpu }]),
    );

    const novosBruto: ConfrontoOnline[] = [];
    for (const nomeGrupo of NOMES_GRUPOS) {
      const doGrupo = grupos.filter(s => s.grupo === nomeGrupo);
      for (const [a, b] of pares) {
        const s1 = doGrupo[a];
        const s2 = doGrupo[b];
        if (!s1 || !s2) continue;
        novosBruto.push({
          id: `grupos-${nomeGrupo}-${rodada}-${a}${b}`,
          fase: "grupos",
          slot1_id: s1.slot_id,
          slot2_id: s2.slot_id,
          vencedor_slot_id: null,
          partida_online_id: null,
        });
      }
    }
    const novos = aplicarMetaConfrontos(novosBruto, slotsInfo);

    await admin
      .from("torneio_online")
      .update({ chaveamento: [...chaveamento, ...novos] })
      .eq("sala_id", data.salaId);

    return { ok: true, confrontos: novos };
  });

// ===========================================================================
// Auto-início entre partidas: cada jogador tem PRAZO_PRONTO_MS pra apertar
// "estou pronto" no seu próximo confronto. CPU é marcada como pronta na
// criação do confronto. Se o prazo estourar e o humano não confirmou, qualquer
// membro pode chamar resolverWOConfronto pra encerrar como WO.
// ===========================================================================

/** Marca o slot do usuário (ou o slot1 se ele for casa, ou slot2 se for fora)
 * como pronto pro confronto. Se for a primeira confirmação, também garante
 * que disponivel_em esteja setado (defesa para confrontos pré-existentes). */
export const confirmarProntoConfronto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SimularInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    const me = await exigirMembro(admin, data.salaId, userId);

    const torneio = await buscarTorneio(admin, data.salaId);
    const chaveamento: ConfrontoOnline[] = torneio.chaveamento ?? [];
    const idx = chaveamento.findIndex(c => c.id === data.confrontoId);
    if (idx === -1) throw new Error("Confronto não encontrado.");
    const c = chaveamento[idx]!;
    if (c.partida_online_id) return { ok: true }; // já jogado
    if (c.slot1_id !== me.id && c.slot2_id !== me.id) {
      throw new Error("Você não está neste confronto.");
    }
    const novo: ConfrontoOnline = {
      ...c,
      disponivel_em: c.disponivel_em ?? new Date().toISOString(),
      slot1_pronto: c.slot1_pronto || c.slot1_id === me.id,
      slot2_pronto: c.slot2_pronto || c.slot2_id === me.id,
    };
    const novoChaveamento = [...chaveamento];
    novoChaveamento[idx] = novo;
    await admin
      .from("torneio_online")
      .update({ chaveamento: novoChaveamento })
      .eq("sala_id", data.salaId);
    return { ok: true, ambosProntos: !!(novo.slot1_pronto && novo.slot2_pronto) };
  });

/** Resolve um confronto por WO: o(s) lado(s) que não apertou pronto leva 0x3.
 * Só funciona se o prazo já estourou. Idempotente. */
export const resolverWOConfronto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SimularInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMembro(admin, data.salaId, userId);

    const torneio = await buscarTorneio(admin, data.salaId);
    const chaveamento: ConfrontoOnline[] = torneio.chaveamento ?? [];
    const idx = chaveamento.findIndex(c => c.id === data.confrontoId);
    if (idx === -1) throw new Error("Confronto não encontrado.");
    const c = chaveamento[idx]!;
    if (c.partida_online_id) {
      // já encerrado por outro caminho
      const { data: existente } = await admin
        .from("partida_online")
        .select("*")
        .eq("id", c.partida_online_id)
        .maybeSingle();
      return existente;
    }
    if (c.slot1_pronto && c.slot2_pronto) {
      throw new Error("Os dois estão prontos — chame simularPartidaOnline.");
    }
    const inicio = c.disponivel_em ? new Date(c.disponivel_em).getTime() : null;
    if (!inicio || Date.now() - inicio < PRAZO_PRONTO_MS) {
      throw new Error("Ainda dentro do prazo de 30s.");
    }

    // Determina vencedor por WO
    let vencedorSlotId: string;
    let placar1 = 0, placar2 = 0;
    const texto: string[] = [];
    if (c.slot1_pronto && !c.slot2_pronto) {
      vencedorSlotId = c.slot1_id; placar1 = 3;
      texto.push("Vitória por WO — adversário não confirmou em 30s");
    } else if (c.slot2_pronto && !c.slot1_pronto) {
      vencedorSlotId = c.slot2_id; placar2 = 3;
      texto.push("Vitória por WO — adversário não confirmou em 30s");
    } else {
      // ninguém apertou: WO duplo, slot1 avança por critério arbitrário
      vencedorSlotId = c.slot1_id;
      texto.push("WO duplo — nenhum jogador confirmou em 30s");
    }

    // Busca user_ids pros campos jogadorN_id (NOT NULL no schema antigo, usa zero-uuid se for CPU)
    const { data: slot1Row } = await admin.from("sala_jogadores").select("user_id").eq("id", c.slot1_id).maybeSingle();
    const { data: slot2Row } = await admin.from("sala_jogadores").select("user_id").eq("id", c.slot2_id).maybeSingle();

    const { data: partida, error: errPartida } = await admin
      .from("partida_online")
      .insert({
        jogador1_id: slot1Row?.user_id ?? null,
        jogador2_id: slot2Row?.user_id ?? null,
        placar1, placar2,
        vencedor_id: vencedorSlotId === c.slot1_id ? slot1Row?.user_id ?? null : slot2Row?.user_id ?? null,
        sala_id: data.salaId,
        fase: c.fase,
        rodada: 1,
        log_eventos: [{ minuto: 1, tipo: "info", texto: texto[0]! }],
        penaltis: null,
        encerrada: true,
      })
      .select("*")
      .single();
    if (errPartida) throw new Error(errPartida.message);

    const novoChaveamento = chaveamento.map(x =>
      x.id === c.id ? { ...x, vencedor_slot_id: vencedorSlotId, partida_online_id: partida.id } : x,
    );
    let novaClassif = { ...(torneio.classificacao_grupos ?? {}) } as Record<string, ClassifLinha>;
    if (c.fase === "grupos") {
      const c1 = novaClassif[c.slot1_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
      const c2 = novaClassif[c.slot2_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
      c1.jogos++; c2.jogos++;
      c1.gols_pro += placar1; c1.gols_contra += placar2;
      c2.gols_pro += placar2; c2.gols_contra += placar1;
      if (placar1 > placar2) c1.pontos += 3;
      else if (placar2 > placar1) c2.pontos += 3;
      novaClassif = { ...novaClassif, [c.slot1_id]: c1, [c.slot2_id]: c2 };
    }
    await admin
      .from("torneio_online")
      .update({ chaveamento: novoChaveamento, classificacao_grupos: novaClassif })
      .eq("sala_id", data.salaId);

    return partida;
  });

