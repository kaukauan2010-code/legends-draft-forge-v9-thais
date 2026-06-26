// ============================================================
// FASE 2 — Draft online simultâneo: server functions.
//
// Convenção do projeto (ver comentário em client.server.ts): este arquivo
// "*.functions.ts" é importado pela rota e por isso entra no bundle do
// client — mas só com os WRAPPERS (createServerFn). Nunca importar
// `@/integrations/supabase/client.server` no topo deste arquivo; o
// import é feito dinamicamente DENTRO de cada handler, garantindo que o
// service role key nunca vaza pro bundle do browser.
//
// Anti-cheat: o client nunca decide qual seleção aparece nem grava
// escolhas diretamente (a tabela `sala_draft` não tem GRANT de
// INSERT/UPDATE para `authenticated` — só SELECT). Toda mutação passa
// por aqui, autenticada via `requireSupabaseAuth`, e validada contra o
// estado real gravado no banco.
// ============================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { Jogador, Selecao } from "@/lib/selecoes";
import { posicoesCompativeis, sortearSelecao } from "@/lib/selecoes";
import { FORMACOES, type FormacaoId } from "@/lib/formacoes";
import type { JogadorEscalado } from "@/lib/simulador";

type SalaDraftRow = Database["public"]["Tables"]["sala_draft"]["Row"];
// `supabaseAdmin` é tipado com `Database`, mas como ele só é importado
// dinamicamente (ver acima), usamos `any` aqui pra não precisar importar
// o tipo do client no topo do arquivo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

async function getAdmin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ---------- helpers internos (rodam só no servidor) ----------

async function exigirMembroHumano(admin: AdminClient, salaId: string, userId: string) {
  const { data } = await admin
    .from("sala_jogadores")
    .select("id, is_cpu")
    .eq("sala_id", salaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.is_cpu) {
    throw new Error("Você não é um jogador humano desta sala.");
  }
}

async function buscarSala(admin: AdminClient, salaId: string) {
  const { data } = await admin
    .from("salas")
    .select("id, modo, status, competicao, max_jogadores")
    .eq("id", salaId)
    .maybeSingle();
  if (!data) throw new Error("Sala não encontrada.");
  return data as { id: string; modo: string; status: string; competicao: string; max_jogadores: number };
}

async function buscarMeuDraft(admin: AdminClient, salaId: string, userId: string): Promise<SalaDraftRow> {
  const { data } = await admin
    .from("sala_draft")
    .select("*")
    .eq("sala_id", salaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Seu draft ainda não foi iniciado nesta sala.");
  return data as SalaDraftRow;
}

async function nomesBloqueadosNaSala(admin: AdminClient, salaId: string): Promise<Set<string>> {
  const { data } = await admin.from("sala_draft").select("nomes_escolhidos").eq("sala_id", salaId);
  const bloqueados = new Set<string>();
  for (const row of (data ?? []) as { nomes_escolhidos: string[] }[]) {
    for (const nome of row.nomes_escolhidos ?? []) bloqueados.add(nome);
  }
  return bloqueados;
}

function montarEscalado(jogador: Jogador, slotId: string, posicaoSlot: string): JogadorEscalado {
  return {
    ...jogador,
    slotId,
    improvisado: jogador.posicao !== posicaoSlot,
    // Mantém paridade exata com o draft solo (`campanha.ts: posicionarEm`):
    // a força efetiva do jogador escolhido pelo humano NÃO leva o -10 de
    // improviso — esse penalty só é aplicado aos times de CPU montados
    // automaticamente (`simulador.ts: montarVariosTimesCPU`).
    forcaEfetiva: jogador.forca,
  };
}

async function sortearParaUsuario(
  admin: AdminClient,
  salaId: string,
  userId: string,
  row: SalaDraftRow,
  opts: { isReroll: boolean },
): Promise<SalaDraftRow> {
  if (row.terminou) throw new Error("Seu draft já terminou.");
  if (opts.isReroll) {
    if (!row.jogadores_oferecidos) throw new Error("Não há seleção ativa para re-sortear.");
    if (row.rerolls_restantes <= 0) throw new Error("Sem rerolls disponíveis.");
  } else if (row.jogadores_oferecidos) {
    throw new Error("Já existe uma seleção sorteada — escolha um jogador ou use o reroll.");
  }

  // Exclui o que esse jogador já recebeu antes (não repete pra ele mesmo).
  const excluir = [...row.selecoes_oferecidas];

  // 1ª rodada: garante que nenhum jogador da sala receba a MESMA primeira
  // seleção que outro já recebeu (regra explícita do plano de Fase 2).
  if (row.rodada_atual === 0) {
    const { data: outros } = await admin
      .from("sala_draft")
      .select("selecoes_oferecidas")
      .eq("sala_id", salaId)
      .neq("user_id", userId);
    for (const outro of (outros ?? []) as { selecoes_oferecidas: string[] }[]) {
      const primeira = outro.selecoes_oferecidas?.[0];
      if (primeira) excluir.push(primeira);
    }
  }

  // Slots ainda livres na MINHA escalação + nomes bloqueados por todos.
  // Igual ao modo solo: NÃO podemos entregar uma seleção sem nenhum jogador
  // utilizável (todos bloqueados ou nenhum cabendo num slot livre).
  const formacao = FORMACOES[row.formacao_id as FormacaoId];
  const escalacaoAtual = (row.escolhas as unknown as JogadorEscalado[]) ?? [];
  const posicoesLivres = new Set(
    formacao.slots.filter((s) => !escalacaoAtual.some((j) => j.slotId === s.id)).map((s) => s.posicao),
  );
  const bloqueados = await nomesBloqueadosNaSala(admin, salaId);

  const tentativasExtras: string[] = [];
  let selecao: Selecao | null = null;
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    const candidata = sortearSelecao([...excluir, ...tentativasExtras]);
    const utilizaveis = candidata.jogadores.filter(
      (j) => !bloqueados.has(j.nome) && posicoesCompativeis(j.posicao).some((p) => posicoesLivres.has(p)),
    );
    if (utilizaveis.length > 0) { selecao = candidata; break; }
    tentativasExtras.push(candidata.id);
  }
  // Fallback: se mesmo após 10 tentativas todas vieram inúteis, manda a última
  // mesmo assim — o usuário pode usar reroll. (Caso raríssimo.)
  if (!selecao) selecao = sortearSelecao([...excluir, ...tentativasExtras.slice(0, -1)]);

  const update = {
    jogadores_oferecidos: selecao,
    selecoes_oferecidas: [...row.selecoes_oferecidas, selecao.id],
    rodada_atual: row.rodada_atual + 1,
    rerolls_restantes: opts.isReroll ? row.rerolls_restantes - 1 : row.rerolls_restantes,
  };
  const { data, error } = await admin.from("sala_draft").update(update).eq("id", row.id).select("*").single();
  if (error) throw new Error(error.message);
  return data as SalaDraftRow;
}

async function escolherParaUsuario(
  admin: AdminClient,
  salaId: string,
  row: SalaDraftRow,
  jogadorNome: string,
  slotId: string,
): Promise<SalaDraftRow> {
  if (row.terminou) throw new Error("Seu draft já terminou.");
  if (!row.jogadores_oferecidos) throw new Error("Nenhuma seleção sorteada pra escolher um jogador.");

  const oferecida = row.jogadores_oferecidos as unknown as Selecao;
  const jogador = oferecida.jogadores.find((j) => j.nome === jogadorNome);
  // Anti-cheat: o jogador escolhido TEM que estar na seleção que o
  // servidor sorteou e gravou pra esse usuário — nunca confiamos em
  // qualquer outro dado de jogador vindo do client.
  if (!jogador) {
    throw new Error("Esse jogador não está na seleção sorteada por você.");
  }
  if (row.nomes_escolhidos.includes(jogadorNome)) {
    throw new Error("Você já escalou esse jogador.");
  }

  const bloqueados = await nomesBloqueadosNaSala(admin, salaId);
  if (bloqueados.has(jogadorNome)) {
    throw new Error(`${jogadorNome} já foi escalado por outro jogador da sala.`);
  }

  const formacao = FORMACOES[row.formacao_id as FormacaoId];
  if (!formacao) throw new Error("Formação inválida.");
  const slotDef = formacao.slots.find((s) => s.id === slotId);
  if (!slotDef) throw new Error("Slot inválido para sua formação.");

  const escolhasAtuais = (row.escolhas as unknown as JogadorEscalado[]) ?? [];
  if (escolhasAtuais.some((j) => j.slotId === slotId)) {
    throw new Error("Esse slot já está ocupado.");
  }
  if (!posicoesCompativeis(jogador.posicao).includes(slotDef.posicao)) {
    throw new Error(`${jogador.nome} (${jogador.posicao}) não pode ocupar o slot ${slotDef.label}.`);
  }

  const escalado = montarEscalado(jogador, slotId, slotDef.posicao);
  const novasEscolhas = [...escolhasAtuais, escalado];
  const update = {
    escolhas: novasEscolhas,
    nomes_escolhidos: [...row.nomes_escolhidos, jogadorNome],
    jogadores_oferecidos: null,
    terminou: novasEscolhas.length >= 11,
  };
  const { data, error } = await admin.from("sala_draft").update(update).eq("id", row.id).select("*").single();
  if (error) throw new Error(error.message);
  return data as SalaDraftRow;
}

// ---------- validators de input ----------

const SalaIdInput = z.object({ salaId: z.string().uuid() });
const IniciarInput = z.object({
  salaId: z.string().uuid(),
  formacaoId: z.string(),
  estrategia: z.enum(["defensiva", "equilibrada", "ofensiva"]),
  nomeTime: z.string().max(40).optional(),
});
const SortearInput = z.object({ salaId: z.string().uuid(), isReroll: z.boolean().optional() });
const EscolherInput = z.object({ salaId: z.string().uuid(), jogadorNome: z.string(), slotId: z.string() });
const ExcluirInput = z.object({ salaId: z.string().uuid(), slotId: z.string() });

// ---------- server functions exportadas ----------

/** Cria (ou retorna, se já existir) o registro de draft do jogador autenticado na sala. */
export const iniciarDraftOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IniciarInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMembroHumano(admin, data.salaId, userId);
    const sala = await buscarSala(admin, data.salaId);
    if (sala.status === "lobby") {
      throw new Error("O mestre ainda não iniciou a partida nesta sala.");
    }

    const { data: existente } = await admin
      .from("sala_draft")
      .select("*")
      .eq("sala_id", data.salaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existente) return existente as SalaDraftRow;

    if (!(data.formacaoId in FORMACOES)) throw new Error("Formação inválida.");
    const limite = sala.modo === "almanaque" ? 1 : 3;
    const { data: criado, error } = await admin
      .from("sala_draft")
      .insert({
        sala_id: data.salaId,
        user_id: userId,
        formacao_id: data.formacaoId,
        estrategia: data.estrategia,
        nome_time: (data.nomeTime?.trim() || "Meu Time").slice(0, 40),
        rerolls_restantes: limite,
        trocas_restantes: limite,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return criado as SalaDraftRow;
  });

/** Sorteia a próxima seleção (ou re-sorteia, se `isReroll`) — sempre decidido no servidor. */
export const sortearSelecaoOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SortearInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMembroHumano(admin, data.salaId, userId);
    const row = await buscarMeuDraft(admin, data.salaId, userId);
    return sortearParaUsuario(admin, data.salaId, userId, row, { isReroll: !!data.isReroll });
  });

/** Confirma a escolha de um jogador da seleção sorteada para um slot da formação. */
export const escolherJogadorOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EscolherInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMembroHumano(admin, data.salaId, userId);
    const row = await buscarMeuDraft(admin, data.salaId, userId);
    return escolherParaUsuario(admin, data.salaId, row, data.jogadorNome, data.slotId);
  });

/** Remove um jogador já escalado (libera o slot e o nome) — consome 1 troca. */
export const excluirJogadorOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExcluirInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMembroHumano(admin, data.salaId, userId);
    const row = await buscarMeuDraft(admin, data.salaId, userId);
    if (row.trocas_restantes <= 0) throw new Error("Sem trocas disponíveis.");

    const escolhasAtuais = (row.escolhas as unknown as JogadorEscalado[]) ?? [];
    const jogador = escolhasAtuais.find((j) => j.slotId === data.slotId);
    if (!jogador) throw new Error("Não há jogador nesse slot.");

    const novasEscolhas = escolhasAtuais.filter((j) => j.slotId !== data.slotId);
    const update = {
      escolhas: novasEscolhas,
      nomes_escolhidos: row.nomes_escolhidos.filter((n) => n !== jogador.nome),
      trocas_restantes: row.trocas_restantes - 1,
      terminou: novasEscolhas.length >= 11,
    };
    const { data: atualizado, error } = await admin
      .from("sala_draft")
      .update(update)
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return atualizado as SalaDraftRow;
  });

/** Cronômetro zerou: escolhe automaticamente (mesma regra do `forcarFimDraft` solo). */
export const forcarFimDraftOnline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SalaIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const userId = (context as { userId: string }).userId;
    await exigirMembroHumano(admin, data.salaId, userId);
    const row = await buscarMeuDraft(admin, data.salaId, userId);
    if (row.terminou) return row;

    if (!row.jogadores_oferecidos) {
      return sortearParaUsuario(admin, data.salaId, userId, row, { isReroll: false });
    }

    const oferecida = row.jogadores_oferecidos as unknown as Selecao;
    const formacao = FORMACOES[row.formacao_id as FormacaoId];
    const escolhasAtuais = (row.escolhas as unknown as JogadorEscalado[]) ?? [];
    const slotsLivres = formacao.slots.filter((s) => !escolhasAtuais.some((j) => j.slotId === s.id));
    const posicoesLivres = new Set(slotsLivres.map((s) => s.posicao));
    const bloqueados = await nomesBloqueadosNaSala(admin, data.salaId);

    const candidatos = oferecida.jogadores.filter(
      (j) => !bloqueados.has(j.nome) && posicoesCompativeis(j.posicao).some((p) => posicoesLivres.has(p)),
    );
    if (!candidatos.length) {
      // Nenhum jogador da seleção atual cabe em algum slot livre: descarta
      // e sorteia outra, igual ao fallback do `forcarFimDraft` solo.
      await admin.from("sala_draft").update({ jogadores_oferecidos: null }).eq("id", row.id);
      return sortearParaUsuario(admin, data.salaId, userId, { ...row, jogadores_oferecidos: null }, { isReroll: false });
    }
    const auto = candidatos[Math.floor(Math.random() * candidatos.length)]!;
    const slotsCompat = slotsLivres.filter((s) => posicoesCompativeis(auto.posicao).includes(s.posicao));
    const slotEscolhido = slotsCompat[Math.floor(Math.random() * slotsCompat.length)]!;
    return escolherParaUsuario(admin, data.salaId, row, auto.nome, slotEscolhido.id);
  });
