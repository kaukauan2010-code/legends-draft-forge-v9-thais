import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dices, Shuffle, Shield, Sword, Star, Trash2, X, Lock, Crown, Users, Check, Hourglass,
} from "lucide-react";
import { FORMACOES, LISTA_FORMACOES, type FormacaoId } from "@/lib/formacoes";
import { MiniCampo } from "@/components/MiniCampo";
import { PlayerCard } from "@/components/PlayerCard";
import { RARIDADE_CSS, posicoesCompativeis, type Jogador } from "@/lib/selecoes";
import { statsEscalacao, type Estrategia, type JogadorEscalado } from "@/lib/simulador";
import type { Database } from "@/integrations/supabase/types";
import {
  iniciarDraftOnline,
  sortearSelecaoOnline,
  escolherJogadorOnline,
  excluirJogadorOnline,
  forcarFimDraftOnline,
} from "@/lib/draft-online.functions";
import { iniciarTorneioOnline } from "@/lib/torneio-online.functions";

export const Route = createFileRoute("/_app/online/$codigo/draft")({
  head: () => ({ meta: [{ title: "Draft Online — World Cup Draft" }] }),
  component: DraftOnline,
});

type SalaDraftRow = Database["public"]["Tables"]["sala_draft"]["Row"];
interface Sala {
  id: string; codigo: string; mestre_id: string;
  modo: "classico" | "almanaque"; competicao: "oitavas" | "final" | "copa"; status: string;
}
interface JogadorSala {
  id: string; sala_id: string; user_id: string | null; nome: string; is_cpu: boolean; slot: number;
}

function DraftOnline() {
  const { codigo } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sala, setSala] = useState<Sala | null>(null);
  const [humanos, setHumanos] = useState<JogadorSala[]>([]);
  const [meuDraft, setMeuDraft] = useState<SalaDraftRow | null>(null);
  const [todosDrafts, setTodosDrafts] = useState<SalaDraftRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pendente, setPendente] = useState<Jogador | null>(null);
  const [slotParaExcluir, setSlotParaExcluir] = useState<string | null>(null);
  const [verPicksDe, setVerPicksDe] = useState<string | null>(null);
  const [tempo, setTempo] = useState(30);
  const [iniciandoTorneio, setIniciandoTorneio] = useState(false);

  const [formacaoId, setFormacaoId] = useState<FormacaoId>("4-3-3");
  const [estrategia, setEstrategia] = useState<Estrategia>("equilibrada");
  const [nomeTime, setNomeTime] = useState("");

  // --- carrega sala + jogadores + meu draft + draft dos outros ---
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: s } = await supabase.from("salas").select("*").eq("codigo", codigo).maybeSingle();
      if (cancelado) return;
      if (!s) { toast.error("Sala não encontrada"); navigate({ to: "/online" }); return; }
      if (s.status === "lobby") { navigate({ to: "/online/$codigo", params: { codigo } }); return; }
      setSala(s as Sala);

      const { data: jogs } = await supabase.from("sala_jogadores").select("*").eq("sala_id", s.id).order("slot");
      if (cancelado) return;
      const todos = (jogs ?? []) as JogadorSala[];
      setHumanos(todos.filter(j => !j.is_cpu));

      const souMembro = todos.some(j => j.user_id === user?.id && !j.is_cpu);
      if (!souMembro) { toast.error("Você não está nesta sala."); navigate({ to: "/online" }); return; }

      const { data: drafts } = await supabase.from("sala_draft").select("*").eq("sala_id", s.id);
      if (cancelado) return;
      const lista = (drafts ?? []) as SalaDraftRow[];
      setTodosDrafts(lista);
      setMeuDraft(lista.find(d => d.user_id === user?.id) ?? null);
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [codigo, navigate, user?.id]);

  // --- heartbeat: avisa presença pra detecção de desconexão na fase de torneio ---
  useEffect(() => {
    if (!sala || !user) return;
    const enviar = () => {
      supabase.from("sala_jogadores").update({ last_seen_at: new Date().toISOString() })
        .eq("sala_id", sala.id).eq("user_id", user.id).then();
    };
    enviar();
    const id = setInterval(enviar, 15000);
    return () => clearInterval(id);
  }, [sala?.id, user?.id]);

  // --- realtime: progresso de todo mundo na sala ---
  useEffect(() => {
    if (!sala) return;
    const ch = supabase
      .channel(`sala-draft-${sala.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sala_draft", filter: `sala_id=eq.${sala.id}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as SalaDraftRow;
            setTodosDrafts(prev => prev.filter(d => d.id !== old.id));
            return;
          }
          const row = payload.new as SalaDraftRow;
          setTodosDrafts(prev => {
            const idx = prev.findIndex(d => d.id === row.id);
            if (idx === -1) return [...prev, row];
            const novo = [...prev]; novo[idx] = row; return novo;
          });
          if (row.user_id === user?.id) setMeuDraft(row);
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "salas", filter: `id=eq.${sala.id}` },
        (payload) => { if (payload.new) setSala(payload.new as Sala); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sala?.id, user?.id]);

  // cronômetro: reseta quando muda a seleção sorteada, o nº de escolhas ou o pendente
  useEffect(() => { setTempo(30); }, [meuDraft?.jogadores_oferecidos, (meuDraft?.escolhas as unknown[] | undefined)?.length, pendente?.nome]);

  useEffect(() => {
    if (sala?.status === "torneio") navigate({ to: "/online/$codigo/torneio", params: { codigo } });
  }, [sala?.status, codigo, navigate]);

  useEffect(() => {
    if (!sala || !meuDraft || meuDraft.terminou || enviando) return;
    if (tempo <= 0) {
      setPendente(null);
      forcarFimDraftOnline({ data: { salaId: sala.id } })
        .then((novo: unknown) => setMeuDraft(novo as SalaDraftRow))
        .catch((e: Error) => toast.error(e.message));
      toast.warning("Tempo esgotado — escolha automática");
      return;
    }
    const t = setTimeout(() => setTempo((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [tempo, sala, meuDraft, pendente, enviando]);

  const nomesBloqueados = useMemo(
    () => new Set(todosDrafts.flatMap(d => d.nomes_escolhidos ?? [])),
    [todosDrafts],
  );

  if (carregando || !sala) {
    return <div className="grid min-h-[60vh] place-items-center text-muted-foreground text-sm">Carregando draft...</div>;
  }

  const limite = sala.modo === "almanaque" ? 1 : 3;

  // ====== ETAPA 0: ainda não escolheu formação/estratégia ======
  if (!meuDraft) {
    const comecar = async () => {
      setEnviando(true);
      try {
        const criado = await iniciarDraftOnline({
          data: { salaId: sala.id, formacaoId, estrategia, nomeTime: nomeTime.trim() || "Meu Time" },
        });
        setMeuDraft(criado as SalaDraftRow);
        setTodosDrafts(prev => [...prev.filter(d => d.user_id !== user?.id), criado as SalaDraftRow]);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setEnviando(false);
      }
    };

    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-6 animate-enter">
        <header>
          <h1 className="font-display text-3xl uppercase italic tracking-tight">Seu time online</h1>
          <p className="text-sm text-muted-foreground">Escolha formação e estratégia antes de entrar no draft simultâneo.</p>
        </header>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-display uppercase tracking-tight text-lg">Formação Tática</h2>
            <span className="text-[10px] uppercase tracking-widest text-primary">{formacaoId}</span>
          </div>
          <MiniCampo formacao={FORMACOES[formacaoId]} escalacao={[]} />
          <div className="grid grid-cols-3 gap-2">
            {LISTA_FORMACOES.map(f => (
              <button key={f.id} onClick={() => setFormacaoId(f.id)}
                className={cn("rounded-lg border py-3 font-display font-bold uppercase tracking-widest text-xs transition-all",
                  formacaoId === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground")}>
                {f.nome}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-display uppercase tracking-tight text-lg">Estratégia</h2>
          <div className="grid grid-cols-3 gap-2">
            {(["defensiva", "equilibrada", "ofensiva"] as Estrategia[]).map(e => (
              <button key={e} onClick={() => setEstrategia(e)}
                className={cn("rounded-lg border py-3 font-bold uppercase text-[10px] tracking-widest",
                  estrategia === e ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground")}>
                {e}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-1.5">
          <Label>Nome do seu time</Label>
          <Input value={nomeTime} onChange={e => setNomeTime(e.target.value)} placeholder="Ex: Lendas FC" maxLength={40} />
        </section>

        <p className="text-[10px] text-muted-foreground text-center">
          Modo da sala: <span className="font-bold text-primary uppercase">{sala.modo}</span> · {limite} rerolls e {limite} trocas
        </p>

        <Button onClick={comecar} disabled={enviando} className="w-full h-12 font-display uppercase italic tracking-widest text-base font-black">
          Entrar no draft
        </Button>
      </div>
    );
  }

  // ====== dados derivados do meu draft ======
  const formacao = FORMACOES[meuDraft.formacao_id as FormacaoId];
  const escalacao = (meuDraft.escolhas as unknown as JogadorEscalado[]) ?? [];
  const selecaoAtual = meuDraft.jogadores_oferecidos as unknown as { id: string; nome: string; ano: number; bandeira: string; jogadores: Jogador[] } | null;
  const posicoesLivres = new Set(formacao.slots.filter(sl => !escalacao.some(j => j.slotId === sl.id)).map(sl => sl.posicao));
  const stats = statsEscalacao(escalacao);
  const ocupados = new Map(escalacao.map(j => [j.slotId, j]));
  const slotsOrdenados = [...formacao.slots].sort((a, b) => b.y - a.y);
  const jogadorParaExcluir = slotParaExcluir ? ocupados.get(slotParaExcluir) : undefined;

  const outrosHumanos = humanos.filter(h => h.user_id !== user?.id);
  const draftDe = (userId: string | null) => todosDrafts.find(d => d.user_id === userId);
  const todosTerminaram = humanos.length > 0 && humanos.every(h => draftDe(h.user_id)?.terminou);

  const sortear = async (isReroll: boolean) => {
    setEnviando(true);
    try {
      const novo = await sortearSelecaoOnline({ data: { salaId: sala.id, isReroll } });
      setMeuDraft(novo as SalaDraftRow);
      if (isReroll) toast.info("Reroll usado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const escolher = async (slotId: string) => {
    if (!pendente) return;
    setEnviando(true);
    try {
      const novo = await escolherJogadorOnline({ data: { salaId: sala.id, jogadorNome: pendente.nome, slotId } });
      setMeuDraft(novo as SalaDraftRow);
      setPendente(null);
      toast.success(`${pendente.nome} escalado!`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!slotParaExcluir || !jogadorParaExcluir) return;
    setEnviando(true);
    try {
      const novo = await excluirJogadorOnline({ data: { salaId: sala.id, slotId: slotParaExcluir } });
      setMeuDraft(novo as SalaDraftRow);
      toast.success("Jogador removido. Escolha outro para o slot.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
      setSlotParaExcluir(null);
    }
  };

  // ====== ETAPA FINAL: meu draft terminou — aguardando os outros ======
  if (meuDraft.terminou) {
    const ehMestre = user?.id === sala.mestre_id;
    const iniciarTorneio = async () => {
      if (!sala || iniciandoTorneio) return;
      setIniciandoTorneio(true);
      try {
        await iniciarTorneioOnline({ data: { salaId: sala.id } });
        toast.success("Torneio iniciado! Indo para a fase de grupos...");
      } catch (e) {
        toast.error((e as Error).message);
        setIniciandoTorneio(false);
      }
    };
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-10 animate-enter">
        <header className="text-center space-y-2">
          <Hourglass className="mx-auto size-10 text-primary animate-pulse" />
          <h1 className="font-display text-2xl uppercase italic tracking-tight">
            {todosTerminaram ? "Todo mundo terminou!" : "Aguardando outros jogadores"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {todosTerminaram
              ? (ehMestre ? "Toque em \"Iniciar torneio\" pra começar a fase de grupos." : "Aguardando o mestre iniciar o torneio.")
              : "Seu time já está escalado. Acompanhe o progresso dos outros jogadores da sala."}
          </p>
        </header>

        <ProgressoJogadores humanos={humanos} draftDe={draftDe} meuId={user?.id ?? null}
          esconderStats={false} onClickJogador={setVerPicksDe} verPicksDe={verPicksDe} />

        {verPicksDe && (
          <PainelPicks userId={verPicksDe} humanos={humanos} draftDe={draftDe}
            esconderStats={false} onClose={() => setVerPicksDe(null)} />
        )}

        <section className="rounded-2xl border border-border bg-card p-3">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Seu time — {meuDraft.nome_time}</h2>
          <MiniCampo formacao={formacao} escalacao={escalacao} esconderRaridade={false} />
        </section>

        {todosTerminaram && ehMestre && (
          <Button onClick={iniciarTorneio} disabled={iniciandoTorneio}
            className="w-full h-12 font-display uppercase tracking-widest font-black bg-primary">
            {iniciandoTorneio ? "Iniciando..." : "Iniciar torneio"}
          </Button>
        )}
      </div>
    );
  }

  // ====== LOOP PRINCIPAL DO DRAFT ======
  return (
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-destructive">Draft Online · {sala.codigo}</div>
          <div className="text-xs text-muted-foreground">
            Slot {escalacao.length}/11 ·{" "}
            {pendente
              ? <>Clique no campo no slot <span className="font-bold text-primary">{pendente.posicao}</span></>
              : selecaoAtual
                ? <>Escolha um jogador da seleção</>
                : <>Aperte <span className="font-bold text-primary">SORTEAR</span> para a próxima seleção</>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StatBadge icon={<Star className="size-3" />} label="Força" value={stats.forca} />
          <StatBadge icon={<Sword className="size-3" />} label="Ataque" value={stats.ataque} />
          <StatBadge icon={<Shield className="size-3" />} label="Defesa" value={stats.defesa} />
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
              <Dices className="size-3" />Rerolls
            </div>
            <div className="font-display text-lg font-black leading-none">{meuDraft.rerolls_restantes}/{limite}</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
              <Trash2 className="size-3" />Trocas
            </div>
            <div className="font-display text-lg font-black leading-none">{meuDraft.trocas_restantes}/{limite}</div>
          </div>
          {!meuDraft.terminou && (
            <div className={cn("font-display text-3xl font-black tabular-nums",
              tempo <= 10 ? "text-destructive animate-pulse" : "text-foreground")}>
              00:{tempo.toString().padStart(2, "0")}
            </div>
          )}
        </div>
      </div>

      {/* outros jogadores da sala */}
      {outrosHumanos.length > 0 && (
        <ProgressoJogadores humanos={humanos} draftDe={draftDe} meuId={user?.id ?? null}
          esconderStats={false} onClickJogador={setVerPicksDe} verPicksDe={verPicksDe} compacto />
      )}
      {verPicksDe && (
        <PainelPicks userId={verPicksDe} humanos={humanos} draftDe={draftDe}
          esconderStats={false} onClose={() => setVerPicksDe(null)} />
      )}

      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-border bg-card p-3 order-2 md:order-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              {selecaoAtual ? "Escolha um jogador" : "Aguardando sorteio"}
            </h2>
            {selecaoAtual && (
              <Button variant="outline" size="sm" disabled={meuDraft.rerolls_restantes <= 0 || !!pendente || enviando}
                onClick={() => sortear(true)}>
                <Dices className="size-3.5 mr-1" /> {meuDraft.rerolls_restantes}
              </Button>
            )}
          </div>

          {!selecaoAtual && !pendente && (
            <div className="rounded-xl border-2 border-dashed border-primary/40 p-5 text-center">
              <Shuffle className="mx-auto size-8 text-primary mb-2" />
              <p className="text-xs text-muted-foreground mb-3">
                Faltam <span className="font-bold text-foreground">{11 - escalacao.length}</span> jogadores.
              </p>
              <Button onClick={() => sortear(false)} disabled={enviando}
                className="h-10 w-full font-display uppercase italic tracking-widest font-black">
                <Shuffle className="size-4 mr-2" /> Sortear seleção
              </Button>
            </div>
          )}

          {selecaoAtual && (
            <div className="space-y-3 animate-enter">
              <h3 className="font-display text-sm italic uppercase tracking-tight text-center">
                {selecaoAtual.bandeira} {selecaoAtual.nome} {selecaoAtual.ano}
              </h3>
              <ul className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
                {selecaoAtual.jogadores.map(j => {
                  const jaEscalado = nomesBloqueados.has(j.nome);
                  const compativel = !jaEscalado && posicoesCompativeis(j.posicao).some(p => posicoesLivres.has(p));
                  const ehPendente = pendente?.nome === j.nome;
                  return (
                    <li key={j.numero + j.nome} className="relative">
                      <PlayerCard
                        jogador={j} esconderRaridade={false}
                        disabled={!compativel || enviando} selecionado={ehPendente} variant="list"
                        onClick={() => {
                          if (jaEscalado) { toast.error(`${j.nome} já foi escalado nesta sala.`); return; }
                          if (!compativel) { toast.error(`Não há slot livre para ${j.posicao}`); return; }
                          if (ehPendente) { setPendente(null); return; }
                          setPendente(j);
                        }}
                      />
                      {jaEscalado && (
                        <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-card/85 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <Lock className="size-3.5" /> Já escalado
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="text-center text-[9px] text-muted-foreground uppercase tracking-widest">
                Livres: <span className="text-primary font-bold">{[...posicoesLivres].join(" · ")}</span>
              </div>
            </div>
          )}

          {pendente && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs">
              <button className="text-left hover:underline" onClick={() => setPendente(null)}>
                Pendente: <span className="font-bold text-foreground">{pendente.nome}</span>{" "}
                <span className="text-primary">({pendente.posicao})</span>
              </button>
              <button className="text-destructive underline shrink-0 ml-2" onClick={() => setPendente(null)}>cancelar</button>
            </div>
          )}
        </aside>

        <div className="rounded-2xl border border-border bg-card p-3 order-1 md:order-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">{meuDraft.nome_time}</h2>
            <span className="text-[10px] uppercase tracking-widest text-primary">{formacao.nome}</span>
          </div>
          <MiniCampo
            formacao={formacao} escalacao={escalacao} posicaoAlvo={pendente?.posicao} esconderRaridade={false}
            onSlotClick={pendente && !enviando ? (slotId) => escolher(slotId) : undefined}
            onJogadorClick={!pendente ? (slotId) => setSlotParaExcluir(slotId) : undefined}
          />
          <p className="mt-2 text-center text-[9px] text-muted-foreground uppercase tracking-widest">
            Toque em um jogador escalado para trocar
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Escalação atual</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {slotsOrdenados.map(slot => {
            const j = ocupados.get(slot.id);
            return (
              <li key={slot.id} onClick={j ? () => setSlotParaExcluir(slot.id) : undefined}
                className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                  j ? (false ? "border-muted-foreground/40" : `border-rarity-${RARIDADE_CSS[j.raridade]}`) + " bg-secondary cursor-pointer hover:opacity-80"
                    : "border-dashed border-border/50 text-muted-foreground")}>
                <span className="w-10 shrink-0 text-[10px] font-bold uppercase tracking-widest text-primary">{slot.label}</span>
                {j ? (
                  <>
                    <span className="flex-1 truncate font-bold">{j.nome}</span>
                    {!false && (
                      <span className={cn("text-[8px] font-bold uppercase tracking-widest", `rarity-${RARIDADE_CSS[j.raridade]}`)}>{j.raridade}</span>
                    )}
                    {!false && <span className="font-display text-sm font-black">{j.forca}</span>}
                    <Trash2 className="size-3.5 text-muted-foreground shrink-0" />
                  </>
                ) : <span className="flex-1 italic">vazio</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {jogadorParaExcluir && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setSlotParaExcluir(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 animate-enter" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg uppercase italic tracking-tight">Trocar jogador?</h3>
              <button onClick={() => setSlotParaExcluir(null)}><X className="size-4 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              Remover <span className="font-bold text-foreground">{jogadorParaExcluir.nome}</span> ({jogadorParaExcluir.posicao}) e escolher outro jogador para esse slot?
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Trocas restantes: <span className="font-bold text-primary">{meuDraft.trocas_restantes}</span> de {limite} · O reroll não é afetado.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSlotParaExcluir(null)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" disabled={meuDraft.trocas_restantes <= 0 || enviando} onClick={confirmarExclusao}>
                <Trash2 className="size-4 mr-1.5" /> Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">{icon}{label}</div>
      <div className="font-display text-lg font-black leading-none">{value || "—"}</div>
    </div>
  );
}

function ProgressoJogadores({ humanos, draftDe, meuId, onClickJogador, verPicksDe, compacto }: {
  humanos: JogadorSala[];
  draftDe: (userId: string | null) => SalaDraftRow | undefined;
  meuId: string | null;
  esconderStats: boolean;
  onClickJogador: (userId: string) => void;
  verPicksDe: string | null;
  compacto?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-3", compacto && "py-2")}>
      <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Users className="size-3.5" /> Jogadores da sala
      </div>
      <div className="flex flex-wrap gap-2">
        {humanos.map(h => {
          const d = draftDe(h.user_id);
          const qtd = (d?.escolhas as unknown as JogadorEscalado[] | undefined)?.length ?? 0;
          const terminou = d?.terminou ?? false;
          const souEu = h.user_id === meuId;
          return (
            <button key={h.id} onClick={() => h.user_id && !souEu && onClickJogador(h.user_id)} disabled={souEu}
              className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs",
                verPicksDe === h.user_id ? "border-primary bg-primary/10" : "border-border bg-secondary",
                souEu && "opacity-70")}>
              {terminou ? <Check className="size-3.5 text-primary" /> : <Hourglass className="size-3 text-muted-foreground" />}
              <span className="font-bold truncate max-w-[7rem]">{h.nome}{souEu && " (você)"}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{qtd}/11</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PainelPicks({ userId, humanos, draftDe, esconderStats, onClose }: {
  userId: string;
  humanos: JogadorSala[];
  draftDe: (userId: string | null) => SalaDraftRow | undefined;
  esconderStats: boolean;
  onClose: () => void;
}) {
  const draft = draftDe(userId);
  const jogador = humanos.find(h => h.user_id === userId);
  const escalacao = (draft?.escolhas as unknown as JogadorEscalado[] | undefined) ?? [];
  // Em modo Almanaque, só revela força/raridade dos OUTROS depois que eles terminam o draft.
  const esconder = esconderStats && !draft?.terminou;
  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 p-3 animate-enter">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-sm uppercase italic tracking-tight">{jogador?.nome ?? "Jogador"}</h3>
        <button onClick={onClose}><X className="size-4 text-muted-foreground" /></button>
      </div>
      {escalacao.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ainda não escalou nenhum jogador.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5">
          {escalacao.map(j => (
            <li key={j.slotId} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px]">
              <Crown className="size-3 text-legendary shrink-0" />
              <span className="flex-1 truncate font-bold">{j.nome}</span>
              {!esconder && <span className="font-display font-black">{j.forcaEfetiva}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
