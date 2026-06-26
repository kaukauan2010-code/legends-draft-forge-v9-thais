// ============================================================
// FASE 3 — Etapa 3.3: tela do torneio online.
// Lê o estado canônico de `torneio_online` (grupos, chaveamento,
// classificação) via realtime. Cada confronto é resolvido no
// SERVIDOR (simularPartidaOnline) — aqui o front só faz o REPLAY
// visual do `log_eventos` já gravado, igual pros dois lados.
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Trophy, Play, Crown, Bot, ChevronRight, Hourglass, Network, WifiOff, Skull, X } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { FORMACOES, type FormacaoId } from "@/lib/formacoes";
import { RARIDADE_CSS } from "@/lib/selecoes";
import type { Estrategia, EventoJogo, JogadorEscalado, Time, CobrancaPenalti } from "@/lib/simulador";
import { CampoAoVivo } from "@/components/CampoAoVivo";
import { useConquistas } from "@/lib/useConquistas";
import {
  simularPartidaOnline,
  avancarFaseOnline,
  gerarRodadaGrupos,
  confirmarProntoConfronto,
  resolverWOConfronto,
} from "@/lib/torneio-online.functions";
import { ChatPlaceholder } from "@/components/ChatPlaceholder";

const TIMEOUT_OFFLINE_MS = 35000; // sem heartbeat por 35s = considerado desconectado
const HEARTBEAT_MS = 15000;
const PRAZO_PRONTO_MS = 30000; // tempo para apertar "estou pronto" antes de WO


export const Route = createFileRoute("/_app/online/$codigo/torneio")({
  head: () => ({ meta: [{ title: "Torneio Online — World Cup Draft" }] }),
  component: TorneioOnline,
});

type TorneioRow = Database["public"]["Tables"]["torneio_online"]["Row"];
type PartidaRow = Database["public"]["Tables"]["partida_online"]["Row"];

interface Sala { id: string; codigo: string; mestre_id: string; velocidade: "normal" | "rapida" | "ultra"; status: string; }
interface SlotJogador {
  id: string; sala_id: string; user_id: string | null; nome: string; is_cpu: boolean;
  grupo: string | null; elenco_online: JogadorEscalado[] | null; last_seen_at: string;
  bandeira: string | null;
}
interface SlotGrupo { slot_id: string; user_id: string | null; nome: string; is_cpu: boolean; grupo: string; }
interface ConfrontoOnline {
  id: string; fase: string; slot1_id: string; slot2_id: string;
  vencedor_slot_id: string | null; partida_online_id: string | null;
  disponivel_em?: string | null;
  slot1_pronto?: boolean;
  slot2_pronto?: boolean;
}
interface ClassifLinha { pontos: number; gols_pro: number; gols_contra: number; jogos: number; }

// Duração do replay visual local conforme a velocidade escolhida pelo jogador.
// (O resultado já vem decidido do servidor — isto só controla a velocidade
// da animação no front. Cada jogador escolhe a sua e salvamos no localStorage.)
const REPLAY_MS: Record<"normal" | "rapida" | "ultra", number> = {
  normal: 30000, rapida: 12000, ultra: 4000,
};
const FASES_MATA = ["oitavas", "quartas", "semi", "final"] as const;
const TITULO_FASE: Record<string, string> = {
  grupos: "Fase de grupos", oitavas: "Oitavas", quartas: "Quartas de final",
  semi: "Semifinal", final: "Final", encerrado: "Torneio encerrado",

};

function TorneioOnline() {
  const { codigo } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sala, setSala] = useState<Sala | null>(null);
  const [slots, setSlots] = useState<SlotJogador[]>([]);
  const [draftsFormacao, setDraftsFormacao] = useState<Record<string, { formacao_id: string; estrategia: Estrategia }>>({});
  const [torneio, setTorneio] = useState<TorneioRow | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [jogando, setJogando] = useState(false);
  const [avancando, setAvancando] = useState(false);

  const { registrarPartida } = useConquistas();
  const registradosRef = useRef<Set<string>>(new Set());
  const historicoRef = useRef<{ fase: string; texto: string; resultado: { eventos: EventoJogo[]; golsCasa: number; golsFora: number }; minhaVitoria: boolean; penaltis?: { golsCasa: number; golsFora: number; cobrancas: CobrancaPenalti[] } }[]>([]);
  const campanhaSalvaRef = useRef(false);
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  // Velocidade do replay agora é FIXA em "ultra" para todo mundo (sem seletor).
  const velocidadeReplay: "ultra" = "ultra";

  // Auto-início + WO
  const [confirmandoPronto, setConfirmandoPronto] = useState(false);
  const woDisparadosRef = useRef<Set<string>>(new Set());
  const autoStartedRef = useRef<Set<string>>(new Set());

  // replay visual de uma partida já decidida no servidor
  const [replay, setReplay] = useState<{
    casa: Time; fora: Time; eventos: EventoJogo[]; minuto: number; mostrados: EventoJogo[];
    placarCasa: number; placarFora: number; penaltis?: CobrancaPenalti[] | null;
  } | null>(null);
  const [resumo, setResumo] = useState<{ casa: Time; fora: Time; placar: string; minhaVitoria: boolean } | null>(null);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- carregamento inicial ----------
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: s } = await supabase.from("salas").select("*").eq("codigo", codigo).maybeSingle();
      if (cancelado) return;
      if (!s) { toast.error("Sala não encontrada"); navigate({ to: "/online" }); return; }
      if (s.status === "lobby") { navigate({ to: "/online/$codigo", params: { codigo } }); return; }
      if (s.status === "draft") { navigate({ to: "/online/$codigo/draft", params: { codigo } }); return; }
      setSala(s as Sala);

      const { data: sj } = await supabase.from("sala_jogadores").select("*").eq("sala_id", s.id);
      if (cancelado) return;
      setSlots((sj ?? []) as unknown as SlotJogador[]);

      const { data: drafts } = await supabase.from("sala_draft").select("user_id, formacao_id, estrategia").eq("sala_id", s.id);
      if (!cancelado) {
        const mapa: Record<string, { formacao_id: string; estrategia: Estrategia }> = {};
        for (const d of drafts ?? []) mapa[d.user_id] = { formacao_id: d.formacao_id, estrategia: d.estrategia as Estrategia };
        setDraftsFormacao(mapa);
      }

      const { data: t } = await supabase.from("torneio_online").select("*").eq("sala_id", s.id).maybeSingle();
      if (!cancelado) { setTorneio((t as TorneioRow) ?? null); setCarregando(false); }
    })();
    return () => { cancelado = true; };
  }, [codigo, navigate]);

  // ---------- realtime ----------
  useEffect(() => {
    if (!sala) return;
    const ch = supabase
      .channel(`sala-torneio-${sala.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "torneio_online", filter: `sala_id=eq.${sala.id}` },
        payload => { if (payload.new) setTorneio(payload.new as TorneioRow); })
      .on("postgres_changes", { event: "*", schema: "public", table: "sala_jogadores", filter: `sala_id=eq.${sala.id}` },
        async () => {
          const { data: sj } = await supabase.from("sala_jogadores").select("*").eq("sala_id", sala.id);
          setSlots((sj ?? []) as unknown as SlotJogador[]);
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "salas", filter: `id=eq.${sala.id}` },
        payload => { if (payload.new) setSala(payload.new as Sala); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sala?.id]);

  useEffect(() => () => { if (intervaloRef.current) clearInterval(intervaloRef.current); }, []);

  // heartbeat: avisa que ainda estou aqui, a cada 15s
  useEffect(() => {
    if (!sala || !user) return;
    const enviar = () => {
      supabase.from("sala_jogadores").update({ last_seen_at: new Date().toISOString() })
        .eq("sala_id", sala.id).eq("user_id", user.id).then();
    };
    enviar();
    const id = setInterval(enviar, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [sala?.id, user?.id]);

  // ticker de 5s só pra re-renderizar e recalcular quem está offline
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const meuSlot = useMemo(() => slots.find(s => s.user_id === user?.id) ?? null, [slots, user?.id]);
  const slotPorId = useMemo(() => new Map(slots.map(s => [s.id, s])), [slots]);
  const nomeDe = (slotId: string | null) => (slotId ? slotPorId.get(slotId)?.nome ?? "—" : "—");
  const bandeiraDe = (slotId: string | null) => (slotId ? slotPorId.get(slotId)?.bandeira ?? "🏳️" : "🏳️");
  const estaOffline = (slotId: string | null) => {
    const s = slotId ? slotPorId.get(slotId) : null;
    if (!s || s.is_cpu || !s.user_id) return false;
    return Date.now() - new Date(s.last_seen_at).getTime() > TIMEOUT_OFFLINE_MS;
  };

  const chaveamento = (torneio?.chaveamento as unknown as ConfrontoOnline[]) ?? [];
  const grupos = (torneio?.grupos as unknown as SlotGrupo[]) ?? [];
  const classif = (torneio?.classificacao_grupos as unknown as Record<string, ClassifLinha>) ?? {};
  const faseAtual = torneio?.fase_atual ?? "grupos";
  const rodadaAtual = torneio?.rodada_grupos_atual ?? 1;
  // (ehMestre não é mais usado aqui — avanço de fase é automático para qualquer membro.)

  // confrontos relevantes "agora": da rodada de grupos atual, ou da fase de mata-mata atual
  const confrontosAtuais = faseAtual === "grupos"
    ? chaveamento.filter(c => c.fase === "grupos" && Number(c.id.split("-")[2] ?? "1") === rodadaAtual)
    : chaveamento.filter(c => c.fase === faseAtual);

  // meu confronto pendente nesta rodada/fase
  const meuConfronto = meuSlot
    ? confrontosAtuais.find(c => (c.slot1_id === meuSlot.id || c.slot2_id === meuSlot.id) && !c.partida_online_id)
    : undefined;

  const todosResolvidos = confrontosAtuais.length > 0 && confrontosAtuais.every(c =>
    faseAtual === "grupos" ? !!c.partida_online_id : !!c.vencedor_slot_id,
  );

  // qualquer membro: garante que a rodada de grupos atual tenha confrontos gerados
  useEffect(() => {
    if (!torneio || !sala || faseAtual !== "grupos") return;
    if (confrontosAtuais.length > 0) return;
    gerarRodadaGrupos({ data: { salaId: sala.id } }).catch(() => { /* idempotente */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torneio?.id, faseAtual, rodadaAtual, confrontosAtuais.length]);

  // auto-avançar fase: assim que todos os confrontos da fase/rodada estão resolvidos.
  useEffect(() => {
    if (!sala || !todosResolvidos || avancando) return;
    if (faseAtual === "encerrado") return;
    // pequeno delay pra evitar corrida
    const t = setTimeout(() => {
      avancarFaseOnline({ data: { salaId: sala.id } }).catch(() => { /* idempotente */ });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todosResolvidos, faseAtual, rodadaAtual, sala?.id]);

  // auto-start: quando ambos prontos no meu confronto e ainda não jogou.
  useEffect(() => {
    if (!meuConfronto || !sala || jogando || replay || resumo) return;
    if (!meuConfronto.slot1_pronto || !meuConfronto.slot2_pronto) return;
    if (autoStartedRef.current.has(meuConfronto.id)) return;
    autoStartedRef.current.add(meuConfronto.id);
    jogarMeuConfronto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meuConfronto?.id, meuConfronto?.slot1_pronto, meuConfronto?.slot2_pronto, jogando, replay, resumo]);

  // auto-WO: qualquer client dispara WO num confronto pendente cujo prazo de 30s estourou.
  useEffect(() => {
    if (!sala) return;
    for (const c of confrontosAtuais) {
      if (c.partida_online_id) continue;
      if (c.slot1_pronto && c.slot2_pronto) continue;
      if (!c.disponivel_em) continue;
      const decorrido = Date.now() - new Date(c.disponivel_em).getTime();
      if (decorrido < PRAZO_PRONTO_MS) continue;
      if (woDisparadosRef.current.has(c.id)) continue;
      woDisparadosRef.current.add(c.id);
      resolverWOConfronto({ data: { salaId: sala.id, confrontoId: c.id } }).catch(() => { /* idempotente */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confrontosAtuais, sala?.id]);



  function montarTimeDeSlot(slot: SlotJogador): Time {
    const df = slot.user_id ? draftsFormacao[slot.user_id] : undefined;
    const formacaoId = (df?.formacao_id ?? "4-3-3") as FormacaoId;
    if (slot.is_cpu || !slot.elenco_online?.length) {
      return {
        nome: slot.nome, bandeira: "🤖", formacao: FORMACOES[formacaoId] ?? FORMACOES["4-3-3"],
        estrategia: "equilibrada", escalacao: [], isCPU: true,
      };
    }
    return {
      nome: slot.nome, bandeira: "🏆", formacao: FORMACOES[formacaoId] ?? FORMACOES["4-3-3"],
      estrategia: df?.estrategia ?? "equilibrada", escalacao: slot.elenco_online, isCPU: false,
    };
  }

  // ---------- resolver partida de quem está offline (qualquer membro pode acionar) ----------
  const resolverPartidaTravada = async (confrontoId: string) => {
    if (!sala || resolvendoId) return;
    setResolvendoId(confrontoId);
    try {
      await simularPartidaOnline({ data: { salaId: sala.id, confrontoId } });
      toast.success("Partida resolvida automaticamente.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResolvendoId(null);
    }
  };

  // ---------- fecha a campanha online: grava 1 linha em `partidas` (histórico, igual ao solo) ----------
  const fecharCampanha = async (faseAlcancada: "campeao" | "eliminado") => {
    if (campanhaSalvaRef.current || !user || !meuSlot) return;
    campanhaSalvaRef.current = true;
    const df = draftsFormacao[user.id];
    await supabase.from("partidas").insert({
      user_id: user.id,
      modo: "online",
      formacao: df?.formacao_id ?? "4-3-3",
      estrategia: df?.estrategia ?? "equilibrada",
      fase_alcancada: faseAlcancada,
      pontuacao: 0,
      campeao: faseAlcancada === "campeao",
      elenco: meuSlot.elenco_online as any,
      log: historicoRef.current as any,
    });
  };

  // ---------- registra stats/conquistas das minhas partidas (mesmo se outra pessoa resolveu por mim) ----------
  useEffect(() => {
    if (!user || !meuSlot) return;
    const minhas = chaveamento.filter(c =>
      (c.slot1_id === meuSlot.id || c.slot2_id === meuSlot.id) && c.partida_online_id && !registradosRef.current.has(c.id),
    );
    if (!minhas.length) return;
    (async () => {
      for (const c of minhas) {
        registradosRef.current.add(c.id);
        const { data: p } = await supabase.from("partida_online").select("*").eq("id", c.partida_online_id!).maybeSingle();
        if (!p) continue;
        const souSlot1 = c.slot1_id === meuSlot.id;
        const golsMeu = souSlot1 ? p.placar1 : p.placar2;
        const golsAdv = souSlot1 ? p.placar2 : p.placar1;
        const venceuNormal = golsMeu > golsAdv;
        const empateNormal = golsMeu === golsAdv;
        const venceuPenaltis = c.vencedor_slot_id === meuSlot.id && empateNormal;
        const df = draftsFormacao[user.id];
        const campeao = c.fase === "final" && c.vencedor_slot_id === meuSlot.id;
        const eliminadoAgora = c.fase !== "grupos" && c.vencedor_slot_id !== meuSlot.id;
        const nomeAdv = nomeDe(souSlot1 ? c.slot2_id : c.slot1_id);
        const penaltisRow = p.penaltis as unknown as { golsCasa: number; golsFora: number; cobrancas: CobrancaPenalti[] } | null;
        historicoRef.current.push({
          fase: c.fase,
          texto: `${meuSlot.nome} ${golsMeu} x ${golsAdv} ${nomeAdv}`,
          resultado: { eventos: (p.log_eventos as unknown as EventoJogo[]) ?? [], golsCasa: golsMeu, golsFora: golsAdv },
          minhaVitoria: empateNormal ? !!venceuPenaltis : venceuNormal,
          penaltis: penaltisRow ?? undefined,
        });
        await registrarPartida({
          vitoria: empateNormal ? !!venceuPenaltis : venceuNormal,
          empate: empateNormal && !venceuPenaltis && c.fase === "grupos",
          golsMeu, golsAdv,
          formacaoId: df?.formacao_id ?? "4-3-3",
          selecoesUsadas: [],
          jogadoresLendariosEscalados: (meuSlot.elenco_online ?? []).filter(j => j.raridade === "lendario").length,
          improvisados: 0,
          foiPenaltis: empateNormal && c.fase !== "grupos",
          venceuPenaltis,
          campanhaEncerrada: campeao || eliminadoAgora,
          campeao,
        });
        if (campeao) await fecharCampanha("campeao");
        else if (eliminadoAgora) await fecharCampanha("eliminado");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveamento, meuSlot?.id, user?.id]);

  // ---------- gap fechado: eliminação SILENCIOSA na fase de grupos (não me classifiquei) ----------
  useEffect(() => {
    if (!user || !meuSlot || campanhaSalvaRef.current) return;
    if (faseAtual === "grupos") return;
    const apareceEmMata = chaveamento.some(c => c.fase !== "grupos" && (c.slot1_id === meuSlot.id || c.slot2_id === meuSlot.id));
    if (apareceEmMata) return;
    (async () => {
      // fecha a campanha (grava em `partidas`) e soma 1 campanha completa nas stats,
      // sem inflar partidas_jogadas (cada jogo de grupo já foi contado individualmente acima).
      await fecharCampanha("eliminado");
      const { data: atual } = await supabase.from("stats_jogador").select("campanhas_completas").eq("user_id", user.id).maybeSingle();
      await supabase.from("stats_jogador").upsert({
        user_id: user.id, campanhas_completas: (atual?.campanhas_completas ?? 0) + 1,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faseAtual, chaveamento, meuSlot?.id, user?.id]);

  // ---------- jogar meu confronto ----------
  const jogarMeuConfronto = async () => {
    if (!sala || !meuConfronto || jogando) return;
    setJogando(true);
    try {
      const partida = await simularPartidaOnline({ data: { salaId: sala.id, confrontoId: meuConfronto.id } }) as PartidaRow;
      const slot1 = slotPorId.get(meuConfronto.slot1_id);
      const slot2 = slotPorId.get(meuConfronto.slot2_id);
      if (!slot1 || !slot2) { setJogando(false); return; }
      const casa = montarTimeDeSlot(slot1);
      const fora = montarTimeDeSlot(slot2);
      const eventos = [...((partida.log_eventos as unknown as EventoJogo[]) ?? [])].sort((a, b) => a.minuto - b.minuto);
      const penaltis = (partida.penaltis as unknown as { cobrancas: CobrancaPenalti[] } | null)?.cobrancas ?? null;

      setReplay({ casa, fora, eventos, minuto: 0, mostrados: [], placarCasa: 0, placarFora: 0, penaltis });

      const ms = REPLAY_MS[velocidadeReplay] / 90;
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      intervaloRef.current = setInterval(() => {
        setReplay(prev => {
          if (!prev) return prev;
          const minuto = prev.minuto + 1;
          const novos = prev.eventos.filter(e => e.minuto === minuto);
          let pc = prev.placarCasa, pf = prev.placarFora;
          novos.forEach(e => { if (e.tipo === "gol") { if (e.time === "casa") pc++; else if (e.time === "fora") pf++; } });
          const mostrados = [...prev.mostrados, ...novos];
          if (minuto >= 90) {
            clearInterval(intervaloRef.current!);
            setTimeout(() => {
              setReplay(null);
              const souCasa = meuConfronto!.slot1_id === meuSlot!.id;
              const minhaVitoria = souCasa ? partida.placar1 > partida.placar2 : partida.placar2 > partida.placar1;
              setResumo({ casa, fora, placar: `${partida.placar1} x ${partida.placar2}`, minhaVitoria });
              setJogando(false);
            }, 1200);
          }
          return { ...prev, minuto, mostrados, placarCasa: pc, placarFora: pf };
        });
      }, ms);
    } catch (e) {
      toast.error((e as Error).message);
      setJogando(false);
    }
  };

  // (Antes existia botão "avançar fase" só pro mestre. Agora qualquer client
  // dispara o avanço automaticamente via efeito após todos resolverem — ver acima.)


  if (carregando || !sala) {
    return <div className="grid min-h-[60vh] place-items-center text-muted-foreground text-sm">Carregando torneio...</div>;
  }
  if (!torneio) {
    return <div className="grid min-h-[60vh] place-items-center text-muted-foreground text-sm">Aguardando o mestre iniciar o torneio...</div>;
  }

  // ---------- REPLAY AO VIVO (prioridade máxima) ----------
  if (replay) {
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-4 pb-10">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm font-display uppercase italic">
            <span className="truncate">{replay.casa.nome}</span>
            <span className="font-black text-2xl tabular-nums">{replay.placarCasa} x {replay.placarFora}</span>
            <span className="truncate text-right">{replay.fora.nome}</span>
          </div>
          <div className="mt-3 text-center text-primary font-mono text-sm">{replay.minuto}'</div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(replay.minuto / 90) * 100}%` }} />
          </div>
        </div>
        <CampoAoVivo casa={replay.casa} fora={replay.fora}
          eventoAtual={replay.mostrados[replay.mostrados.length - 1] ?? null} velocidade="rapida" />
        <div className="rounded-xl border border-border bg-card p-3 max-h-40 overflow-y-auto flex flex-col-reverse gap-1 text-xs">
          {replay.mostrados.slice().reverse().map((e, i) => (
            <div key={i} className="text-muted-foreground"><span className="text-primary font-bold">{e.minuto}'</span> {e.texto}</div>
          ))}
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
          Resultado já decidido no servidor — esta é a reprodução da partida.
        </p>
      </div>
    );
  }

  // ---------- RESUMO PÓS-JOGO ----------
  if (resumo) {
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-4 animate-enter pb-10">
        <div className={cn("rounded-2xl border-2 p-4 text-center", resumo.minhaVitoria ? "border-primary/60 bg-primary/5" : "border-destructive/40 bg-destructive/5")}>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Fim de jogo</div>
          <div className="flex items-center justify-around">
            <div className="text-center flex-1">
              <div className="text-3xl mb-1">{resumo.casa.bandeira}</div>
              <div className="font-display text-xs uppercase truncate">{resumo.casa.nome}</div>
            </div>
            <div className="font-display text-4xl font-black tabular-nums">{resumo.placar}</div>
            <div className="text-center flex-1">
              <div className="text-3xl mb-1">{resumo.fora.bandeira}</div>
              <div className="font-display text-xs uppercase truncate">{resumo.fora.nome}</div>
            </div>
          </div>
          <p className={cn("mt-2 font-display uppercase text-sm font-black tracking-widest", resumo.minhaVitoria ? "text-primary" : "text-destructive")}>
            {resumo.minhaVitoria ? "Vitória" : "Derrota"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TimeEscalacaoOnline time={resumo.casa} titulo="Casa" />
          <TimeEscalacaoOnline time={resumo.fora} titulo="Fora" />
        </div>
        <Button onClick={() => setResumo(null)} className="w-full h-12 font-display uppercase tracking-widest font-black">
          Continuar
        </Button>
      </div>
    );
  }

  // ---------- TORNEIO ENCERRADO ----------
  if (faseAtual === "encerrado") {
    const final = chaveamento.filter(c => c.fase === "final")[0];
    const campeao = nomeDe(final?.vencedor_slot_id ?? null);
    return (
      <div className="mx-auto max-w-md px-4 py-10 space-y-5 text-center pb-10 animate-enter">
        <Trophy className="mx-auto size-14 text-legendary" />
        <h1 className="font-display text-2xl uppercase italic tracking-tight">{campeao} é campeão!</h1>
        <p className="text-sm text-muted-foreground">O torneio online chegou ao fim. Confira o chaveamento completo abaixo.</p>
        <BracketSimples chaveamento={chaveamento} nomeDe={nomeDe} />
        <Button onClick={() => navigate({ to: "/online/$codigo", params: { codigo } })} variant="outline" className="w-full h-12 font-display uppercase tracking-widest font-black">
          Voltar para a sala
        </Button>
        <Button onClick={() => navigate({ to: "/dashboard" })} variant="ghost" className="w-full h-10 font-display uppercase tracking-widest text-xs">
          Ir para o início
        </Button>
      </div>
    );
  }

  // ---------- TELA PRINCIPAL ----------
  const abandonar = async () => {
    if (!sala || !user) return;
    if (!confirm("Abandonar a sala? Você sairá do torneio.")) return;
    await supabase.from("sala_jogadores").delete().eq("sala_id", sala.id).eq("user_id", user.id);
    navigate({ to: "/online" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-10 animate-enter relative">
      <Button onClick={abandonar} variant="ghost" size="sm"
        className="absolute right-3 top-3 text-destructive h-7 px-2 text-[10px] uppercase tracking-widest font-bold z-20">
        <X className="size-3 mr-1" /> Sair
      </Button>
      <header className="text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Network className="size-3" /> Torneio online · {sala.codigo}
        </div>
        <h1 className="font-display text-xl uppercase italic tracking-tight">
          {TITULO_FASE[faseAtual]}{faseAtual === "grupos" && ` — rodada ${rodadaAtual}/3`}
        </h1>
      </header>

      {/* Meu confronto da rodada/fase atual */}
      {meuSlot && meuConfronto ? (
        <ConfrontoPendenteCard
          confronto={meuConfronto}
          meuSlotId={meuSlot.id}
          nomeDe={nomeDe}
          jogando={jogando}
          confirmando={confirmandoPronto}
          onConfirmarPronto={async () => {
            if (!sala) return;
            setConfirmandoPronto(true);
            try { await confirmarProntoConfronto({ data: { salaId: sala.id, confrontoId: meuConfronto.id } }); }
            catch (e) { toast.error((e as Error).message); }
            finally { setConfirmandoPronto(false); }
          }}
        />
      ) : meuSlot ? (
        <AguardandoCard
          confrontosAtuais={confrontosAtuais}
          meuSlotId={meuSlot.id}
          nomeDe={nomeDe}
          faseAtual={faseAtual}
        />
      ) : null}




      {/* Confrontos da rodada/fase, status geral */}
      <section className="rounded-xl border border-border bg-card p-3 space-y-2">
        <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {faseAtual === "grupos" ? `Jogos da rodada ${rodadaAtual}` : "Confrontos desta fase"}
        </h2>
        <ul className="space-y-1.5">
          {confrontosAtuais.map(c => {
            const pendente = faseAtual === "grupos" ? !c.partida_online_id : !c.vencedor_slot_id;
            const travada = pendente && c.id !== meuConfronto?.id && (estaOffline(c.slot1_id) || estaOffline(c.slot2_id));
            const eMeu = !!meuSlot && (c.slot1_id === meuSlot.id || c.slot2_id === meuSlot.id);
            return (
              <li key={c.id} className={cn(
                "rounded-lg border bg-secondary/40 px-2.5 py-1.5 text-xs space-y-1",
                eMeu ? "border-primary/50" : "border-border",
              )}>
                <div className="flex items-center justify-between">
                  <span className="truncate font-bold">{nomeDe(c.slot1_id)}</span>
                  <span className={cn("px-2 font-display font-black", c.vencedor_slot_id || c.partida_online_id ? "text-primary" : "text-muted-foreground")}>
                    {c.vencedor_slot_id ? <ChevronRight className="size-3 inline" /> : "vs"}
                  </span>
                  <span className="truncate text-right font-bold">{nomeDe(c.slot2_id)}</span>
                </div>
                {pendente && c.disponivel_em && !(c.slot1_pronto && c.slot2_pronto) && (
                  <div className="flex items-center justify-center gap-1 text-[9px] text-muted-foreground">
                    <span>{c.slot1_pronto ? "✓" : "•"}</span>
                    <span>{c.slot2_pronto ? "✓" : "•"}</span>
                  </div>
                )}
                {travada && (
                  <button onClick={() => resolverPartidaTravada(c.id)} disabled={resolvendoId === c.id}
                    className="w-full flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 text-destructive py-1 text-[10px] uppercase tracking-wide font-bold">
                    <WifiOff className="size-3" /> {resolvendoId === c.id ? "Resolvendo..." : "Jogador offline — resolver partida"}
                  </button>
                )}
              </li>
            );
          })}
          {confrontosAtuais.length === 0 && <li className="text-xs text-muted-foreground">Gerando confrontos...</li>}
        </ul>
      </section>

      {/* Classificação dos grupos: meu grupo + todos */}
      {faseAtual === "grupos" && grupos.length > 0 && (
        <ClassificacaoTabs grupos={grupos} classif={classif} nomeDe={nomeDe} bandeiraDe={bandeiraDe} meuSlotId={meuSlot?.id ?? null} />
      )}

      {/* Bracket de mata-mata */}
      {FASES_MATA.includes(faseAtual as typeof FASES_MATA[number]) && (
        <BracketSimples chaveamento={chaveamento} nomeDe={nomeDe} faseDestaque={faseAtual} />
      )}

      {/* Chat (placeholder) */}
      <ChatPlaceholder />

      <p className="text-center text-[10px] text-muted-foreground">
        As próximas fases iniciam automaticamente quando todos os confrontos terminam.
      </p>
    </div>
  );
}

// (TabelaGrupos antigo removido — substituído por ClassificacaoTabs com meu grupo + todos.)


function BracketSimples({ chaveamento, nomeDe, faseDestaque }: {
  chaveamento: ConfrontoOnline[]; nomeDe: (id: string | null) => string; faseDestaque?: string;
}) {
  return (
    <section className="overflow-x-auto -mx-4 px-4 pb-1">
      <div className="flex gap-4 min-w-max">
        {FASES_MATA.map(fase => {
          const confrontos = chaveamento.filter(c => c.fase === fase);
          if (!confrontos.length) return null;
          return (
            <div key={fase} className="flex flex-col gap-2" style={{ minWidth: 140 }}>
              <div className={cn("text-center text-[9px] uppercase tracking-widest font-bold",
                fase === faseDestaque ? "text-primary" : "text-muted-foreground")}>{TITULO_FASE[fase]}</div>
              {confrontos.map(c => (
                <div key={c.id} className="rounded-lg border border-border bg-card text-[10px] overflow-hidden">
                  <div className={cn("px-2 py-1 truncate", c.vencedor_slot_id === c.slot1_id && "bg-primary/10 font-bold")}>{nomeDe(c.slot1_id)}</div>
                  <div className="h-px bg-border" />
                  <div className={cn("px-2 py-1 truncate", c.vencedor_slot_id === c.slot2_id && "bg-primary/10 font-bold")}>{nomeDe(c.slot2_id)}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Mini-card de escalação para o resumo pós-partida online (igual ao componente
// TimeEscalacao do solo, mas como função local para não criar dependência circular).
function TimeEscalacaoOnline({ time, titulo }: { time: Time; titulo: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground text-center mb-1">{titulo}</div>
      <div className="flex items-center gap-1 mb-2 justify-center">
        <span className="text-base">{time.bandeira}</span>
        <span className="font-display text-[10px] uppercase font-bold truncate">{time.nome}</span>
      </div>
      <ul className="space-y-1">
        {time.escalacao.map(j => (
          <li key={j.slotId} className={cn(
            "flex items-center gap-1.5 rounded border-l-2 bg-secondary/40 px-1.5 py-1",
            `border-rarity-${RARIDADE_CSS[j.raridade]}`,
          )}>
            <span className={cn("font-display text-[10px] font-black w-4 text-center tabular-nums", `rarity-${RARIDADE_CSS[j.raridade]}`)}>{j.numero}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold leading-tight truncate">{j.nome}</div>
              <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest">
                <span className="text-muted-foreground">{j.posicao}</span>
                <span className="text-muted-foreground">·</span>
                <span className={cn("font-bold", `rarity-${RARIDADE_CSS[j.raridade]}`)}>{j.raridade}</span>
              </div>
            </div>
            <span className="font-display text-xs font-black tabular-nums">{j.forcaEfetiva}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Card do confronto pendente: mostra placar "vs", status de pronto
// dos dois lados, countdown de 30s e botão "Estou pronto".
// Quando ambos confirmam, auto-start dispara (no efeito do componente pai).
// ──────────────────────────────────────────────────────────────
function ConfrontoPendenteCard({
  confronto, meuSlotId, nomeDe, jogando, confirmando, onConfirmarPronto,
}: {
  confronto: ConfrontoOnline; meuSlotId: string; nomeDe: (id: string | null) => string;
  jogando: boolean; confirmando: boolean; onConfirmarPronto: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const souSlot1 = confronto.slot1_id === meuSlotId;
  const minhaProntidao = souSlot1 ? !!confronto.slot1_pronto : !!confronto.slot2_pronto;
  const outraProntidao = souSlot1 ? !!confronto.slot2_pronto : !!confronto.slot1_pronto;
  const nomeAdversario = nomeDe(souSlot1 ? confronto.slot2_id : confronto.slot1_id);

  const inicio = confronto.disponivel_em ? new Date(confronto.disponivel_em).getTime() : null;
  const restanteMs = inicio ? Math.max(0, PRAZO_PRONTO_MS - (Date.now() - inicio)) : PRAZO_PRONTO_MS;
  const segRestantes = Math.ceil(restanteMs / 1000);
  const ambosProntos = confronto.slot1_pronto && confronto.slot2_pronto;

  return (
    <section className="rounded-xl border border-primary/50 bg-primary/5 p-4 text-center space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sua partida</p>
      <p className="font-display text-lg uppercase italic">
        {nomeDe(confronto.slot1_id)} <span className="text-muted-foreground">vs</span> {nomeDe(confronto.slot2_id)}
      </p>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className={cn(
          "rounded-md border px-2 py-1.5 font-bold uppercase tracking-widest",
          minhaProntidao ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
        )}>
          {minhaProntidao ? "✓ Você" : "Você"}
        </div>
        <div className={cn(
          "rounded-md border px-2 py-1.5 font-bold uppercase tracking-widest truncate",
          outraProntidao ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
        )}>
          {outraProntidao ? "✓ " : ""}{nomeAdversario}
        </div>
      </div>
      {jogando ? (
        <div className="text-sm font-bold text-primary">Iniciando partida...</div>
      ) : ambosProntos ? (
        <div className="text-sm font-bold text-primary animate-pulse">Iniciando automaticamente...</div>
      ) : minhaProntidao ? (
        <div className="text-xs text-muted-foreground">Aguardando adversário confirmar... <span className="font-bold text-primary">{segRestantes}s</span></div>
      ) : (
        <>
          <Button onClick={onConfirmarPronto} disabled={confirmando} className="w-full h-12 font-display uppercase tracking-widest font-black">
            <Play className="size-4 mr-2" /> {confirmando ? "Confirmando..." : `Estou pronto (${segRestantes}s)`}
          </Button>
          {segRestantes <= 5 && (
            <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">⚠ Se não confirmar, você leva WO!</p>
          )}
        </>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────
// Card "aguardando": meu jogo da rodada já terminou, mas ainda há
// confrontos pendentes (eu vou enfrentar o vencedor de algum).
// ──────────────────────────────────────────────────────────────
function AguardandoCard({
  confrontosAtuais, meuSlotId, nomeDe, faseAtual,
}: {
  confrontosAtuais: ConfrontoOnline[]; meuSlotId: string;
  nomeDe: (id: string | null) => string; faseAtual: string;
}) {
  const meuJogo = confrontosAtuais.find(c => c.slot1_id === meuSlotId || c.slot2_id === meuSlotId);
  const pendentesOutros = confrontosAtuais.filter(c =>
    !c.partida_online_id && c.slot1_id !== meuSlotId && c.slot2_id !== meuSlotId,
  );
  return (
    <section className="rounded-xl border border-border bg-card p-4 text-center space-y-2">
      <Hourglass className="mx-auto size-6 text-muted-foreground animate-pulse" />
      <p className="text-sm font-bold">
        {meuJogo
          ? "Aguardando confirmação do resultado da sua partida..."
          : pendentesOutros.length > 0
            ? `Aguardando: ${pendentesOutros.map(c => `${nomeDe(c.slot1_id)} vs ${nomeDe(c.slot2_id)}`).slice(0, 2).join(", ")}${pendentesOutros.length > 2 ? "…" : ""}`
            : faseAtual === "grupos"
              ? "Aguardando próxima rodada..."
              : "Aguardando próxima fase..."}
      </p>
      <p className="text-[10px] text-muted-foreground">A próxima fase começa automaticamente.</p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────
// Classificação geral: tabs "Meu grupo" / "Todos os grupos"
// ──────────────────────────────────────────────────────────────
function ClassificacaoTabs({ grupos, classif, nomeDe, bandeiraDe, meuSlotId }: {
  grupos: SlotGrupo[]; classif: Record<string, ClassifLinha>;
  nomeDe: (id: string | null) => string;
  bandeiraDe: (id: string | null) => string;
  meuSlotId: string | null;
}) {
  const [aba, setAba] = useState<"meu" | "todos">("meu");
  const nomesGrupos = Array.from(new Set(grupos.map(g => g.grupo))).sort();
  const meuGrupo = grupos.find(g => g.slot_id === meuSlotId)?.grupo;
  const exibir = aba === "meu" && meuGrupo ? [meuGrupo] : nomesGrupos;
  return (
    <section className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">Classificação</h2>
        <div className="flex rounded border border-border overflow-hidden text-[9px] uppercase tracking-widest font-bold">
          {(["meu","todos"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)}
              className={cn("px-2 py-0.5", aba === a ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
              {a === "meu" ? "Meu grupo" : "Todos"}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {exibir.map(g => {
          const doGrupo = grupos.filter(x => x.grupo === g).sort((a, b) => {
            const ca = classif[a.slot_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
            const cb = classif[b.slot_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
            return (cb.pontos - ca.pontos) || ((cb.gols_pro - cb.gols_contra) - (ca.gols_pro - ca.gols_contra));
          });
          return (
            <div key={g}>
              <h3 className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Grupo {g}</h3>
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left">Time</th><th>P</th><th>SG</th><th>GP</th></tr>
                </thead>
                <tbody>
                  {doGrupo.map(x => {
                    const c = classif[x.slot_id] ?? { pontos: 0, gols_pro: 0, gols_contra: 0, jogos: 0 };
                    return (
                      <tr key={x.slot_id} className={cn(x.slot_id === meuSlotId && "text-primary font-bold")}>
                        <td className="py-0.5 truncate max-w-[8rem]">
                          {x.is_cpu
                            ? <Bot className="size-3 inline mr-1 text-muted-foreground" />
                            : <span className="mr-1 leading-none">{bandeiraDe(x.slot_id)}</span>}
                          {nomeDe(x.slot_id)}
                        </td>
                        <td className="text-center tabular-nums">{c.pontos}</td>
                        <td className="text-center tabular-nums">{c.gols_pro - c.gols_contra}</td>
                        <td className="text-center tabular-nums">{c.gols_pro}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}
