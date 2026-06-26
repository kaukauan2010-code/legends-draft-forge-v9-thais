import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Copy, Check, X, Crown, Bot, Play, Share2, LogOut, Hourglass } from "lucide-react";
import { ChatPlaceholder } from "@/components/ChatPlaceholder";
import { SELECOES } from "@/lib/selecoes";

export const Route = createFileRoute("/_app/online/$codigo")({
  component: SalaRoute,
});

function SalaRoute() {
  const { codigo } = Route.useParams();
  const isLobby = useRouterState({
    select: (state) => state.location.pathname.replace(/\/$/, "") === `/online/${codigo}`,
  });
  return isLobby ? <SalaLobby /> : <Outlet />;
}

interface Sala {
  id: string; codigo: string; mestre_id: string;
  modo: "classico" | "almanaque"; competicao: "oitavas" | "final" | "copa";
  velocidade: "normal" | "rapida" | "ultra"; status: string; max_jogadores: number;
  tipo_draft?: "simultaneo" | "turno";
}
interface Jogador {
  id: string; sala_id: string; user_id: string | null; nome: string;
  is_cpu: boolean; pronto: boolean; slot: number; bandeira: string | null;
}

// Sorteia uma seleção (nome+bandeira) que ainda não esteja em uso na sala.
// Fallback: se todas já foram usadas, escolhe aleatória mesmo (ordem improvável).
function selecaoLivre(usados: Set<string>): { nome: string; bandeira: string } {
  const disponiveis = SELECOES.filter(s => !usados.has(`${s.nome} ${s.ano}`));
  const pool = disponiveis.length > 0 ? disponiveis : SELECOES;
  const escolhida = pool[Math.floor(Math.random() * pool.length)]!;
  return { nome: `${escolhida.nome} ${escolhida.ano}`, bandeira: escolhida.bandeira };
}

function SalaLobby() {
  const { codigo } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sala, setSala] = useState<Sala | null>(null);
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;
    const carregar = async () => {
      const { data: s } = await supabase.from("salas").select("*").eq("codigo", codigo).maybeSingle();
      if (canceled) return;
      if (!s) { toast.error("Sala não encontrada"); navigate({ to: "/online" }); return; }
      setSala(s as Sala);
      const { data: j } = await supabase.from("sala_jogadores").select("*").eq("sala_id", s.id).order("slot");
      if (!canceled) { setJogadores((j ?? []) as Jogador[]); setLoading(false); }
    };
    carregar();
    return () => { canceled = true; };
  }, [codigo, navigate]);

  useEffect(() => {
    if (!sala) return;
    const ch = supabase
      .channel(`sala-${sala.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "salas", filter: `id=eq.${sala.id}` },
        payload => { if (payload.new) setSala(payload.new as Sala); })
      .on("postgres_changes", { event: "*", schema: "public", table: "sala_jogadores", filter: `sala_id=eq.${sala.id}` },
        async () => {
          const { data: j } = await supabase.from("sala_jogadores").select("*").eq("sala_id", sala.id).order("slot");
          setJogadores((j ?? []) as Jogador[]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sala?.id]);

  useEffect(() => {
    if (sala?.status === "draft") navigate({ to: "/online/$codigo/draft", params: { codigo } });
    if (sala?.status === "torneio") navigate({ to: "/online/$codigo/torneio", params: { codigo } });
  }, [sala?.status, codigo, navigate]);

  // Garante que o meu registro tem nome e bandeira de uma seleção real
  useEffect(() => {
    if (!sala || !user) return;
    const meu = jogadores.find(j => j.user_id === user.id);
    if (meu && !meu.bandeira) {
      const usados = new Set(jogadores.filter(j => j.bandeira).map(j => j.nome));
      const escolha = selecaoLivre(usados);
      supabase.from("sala_jogadores")
        .update({ bandeira: escolha.bandeira, nome: escolha.nome })
        .eq("id", meu.id);
    }
  }, [sala?.id, user?.id, jogadores.length]);

  const meu = jogadores.find(j => j.user_id === user?.id);
  const ehMestre = user?.id === sala?.mestre_id;
  const humanos = useMemo(() => jogadores.filter(j => !j.is_cpu), [jogadores]);

  // Lista de slots completa (com placeholders) - mostra max_jogadores total
  const slotsCompletos = useMemo(() => {
    if (!sala) return [] as (Jogador | null)[];
    const out: (Jogador | null)[] = new Array(sala.max_jogadores).fill(null);
    jogadores.forEach((j, idx) => { if (idx < out.length) out[idx] = j; });
    return out;
  }, [sala, jogadores]);

  if (loading || !sala) {
    return <div className="grid min-h-[60vh] place-items-center text-muted-foreground text-sm">Carregando sala...</div>;
  }

  const linkSala = `${window.location.origin}/online?codigo=${sala.codigo}`;

  const copiarCodigo = async () => {
    await navigator.clipboard.writeText(sala.codigo);
    toast.success("Código copiado");
  };

  const compartilhar = async () => {
    const texto = `Bora jogar World Cup Draft! Código da sala: ${sala.codigo}\n${linkSala}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "World Cup Draft", text: texto, url: linkSala });
        return;
      } catch { /* user cancelou */ }
    }
    await navigator.clipboard.writeText(linkSala);
    toast.success("Link copiado — cola onde quiser!");
  };

  const togglePronto = async () => {
    if (!meu) return;
    await supabase.from("sala_jogadores").update({ pronto: !meu.pronto }).eq("id", meu.id);
  };

  const expulsar = async (j: Jogador) => {
    if (!ehMestre || j.user_id === sala.mestre_id) return;
    await supabase.from("sala_jogadores").delete().eq("id", j.id);
  };

  const sair = async () => {
    if (meu) await supabase.from("sala_jogadores").delete().eq("id", meu.id);
    if (ehMestre) await supabase.from("salas").delete().eq("id", sala.id);
    navigate({ to: "/online" });
  };

  const atualizarConfig = async (campo: "modo" | "competicao" | "tipo_draft", valor: string) => {
    if (!ehMestre) return;
    const update: Partial<Sala> = { [campo]: valor as any } as any;
    if (campo === "competicao") {
      update.max_jogadores = valor === "final" ? 2 : valor === "oitavas" ? 16 : 32;
    }
    await supabase.from("salas").update(update).eq("id", sala.id);
  };

  // Pode iniciar: (a) só eu na sala OU (b) todos os humanos prontos
  const todosProntos = humanos.length === 0 || humanos.every(j => j.pronto);
  const podeIniciar = todosProntos;

  const iniciar = async () => {
    if (!ehMestre) return;
    if (!podeIniciar) { toast.error("Aguardando todos ficarem prontos"); return; }

    // Preenche slots vazios com CPU usando nomes/bandeiras de seleções reais (únicas)
    const max = sala.max_jogadores;
    const faltam = max - jogadores.length;
    const usadosSlot = new Set(jogadores.map(j => j.slot));
    const usadosNome = new Set(jogadores.map(j => j.nome));
    const novosCpu: any[] = [];
    let slot = 1;
    for (let i = 0; i < faltam; i++) {
      while (usadosSlot.has(slot)) slot++;
      usadosSlot.add(slot);
      const escolha = selecaoLivre(usadosNome);
      usadosNome.add(escolha.nome);
      novosCpu.push({
        sala_id: sala.id, user_id: null,
        nome: escolha.nome,
        is_cpu: true, pronto: true, slot,
        bandeira: escolha.bandeira,
      });
    }
    if (novosCpu.length) {
      const { error } = await supabase.from("sala_jogadores").insert(novosCpu);
      if (error) { toast.error(`Erro ao adicionar bots: ${error.message}`); return; }
    }

    // Distribuição uniforme (round-robin) só na competição copa
    const { data: jAll } = await supabase.from("sala_jogadores").select("*").eq("sala_id", sala.id).order("slot");
    const todos = (jAll ?? []) as Jogador[];

    if (sala.competicao === "copa") {
      const grupos = ["A","B","C","D","E","F","G","H"];
      // ímpares começam pelo grupo A — i % 8 já garante isso.
      for (let idx = 0; idx < todos.length; idx++) {
        await supabase.from("sala_jogadores").update({ grupo: grupos[idx % 8] }).eq("id", todos[idx]!.id);
      }
    }

    await supabase.from("salas").update({ status: "draft" }).eq("id", sala.id);
    toast.success("Sala iniciada! Indo para o draft...");
  };

  const labelComp = sala.competicao === "copa" ? "Copa inteira" : sala.competicao === "oitavas" ? "Oitavas direto" : "Final direta";

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-10 animate-enter">
      <header className="text-center space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Código da sala</div>
        <button onClick={copiarCodigo}
          className="mx-auto flex items-center gap-2 rounded-xl border-2 border-primary/50 bg-primary/5 px-4 py-2">
          <span className="font-display text-4xl font-black tracking-[0.3em] tabular-nums">{sala.codigo}</span>
          <Copy className="size-4 text-primary" />
        </button>
        <Button onClick={compartilhar} variant="outline" size="sm"
          className="mx-auto h-9 px-4 text-xs font-bold uppercase tracking-widest">
          <Share2 className="size-4 mr-1.5" /> Compartilhar sala
        </Button>
      </header>

      <section className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Configurações {ehMestre && "(você é o mestre)"}</div>
        <div className="space-y-2 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Competição</div>
            <div className="grid grid-cols-3 gap-1">
              {(["copa","oitavas","final"] as const).map(c => (
                <button key={c} disabled={!ehMestre}
                  onClick={() => atualizarConfig("competicao", c)}
                  className={cn("rounded border py-1.5 text-[10px] font-bold uppercase tracking-widest",
                    sala.competicao === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
                    !ehMestre && "opacity-60 cursor-not-allowed",
                  )}>{c === "copa" ? "Copa" : c === "oitavas" ? "Oitavas" : "Final"}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Modo</div>
            <div className="grid grid-cols-2 gap-1">
              {(["classico","almanaque"] as const).map(m => (
                <button key={m} disabled={!ehMestre}
                  onClick={() => atualizarConfig("modo", m)}
                  className={cn("rounded border py-1.5 text-[10px] font-bold uppercase tracking-widest",
                    sala.modo === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
                    !ehMestre && "opacity-60 cursor-not-allowed",
                  )}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Draft</div>
            <div className="grid grid-cols-2 gap-1">
              {([["simultaneo","Simultâneo"],["turno","Por turno"]] as const).map(([id, label]) => (
                <button key={id} disabled={!ehMestre}
                  onClick={() => atualizarConfig("tipo_draft", id)}
                  className={cn("rounded border py-1.5 text-[10px] font-bold uppercase tracking-widest",
                    (sala.tipo_draft ?? "simultaneo") === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
                    !ehMestre && "opacity-60 cursor-not-allowed",
                  )}>{label}</button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">
              {(sala.tipo_draft ?? "simultaneo") === "simultaneo"
                ? "Todos escolhem ao mesmo tempo."
                : "Cada jogador escolhe na sua vez (em desenvolvimento — sala ainda usa simultâneo)."}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">{labelComp} · até {sala.max_jogadores} jogadores</p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display uppercase text-sm tracking-widest text-muted-foreground">
            Jogadores ({jogadores.length}/{sala.max_jogadores})
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Vazios viram bot ao iniciar
          </span>
        </div>
        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
          {slotsCompletos.map((j, idx) => {
            if (!j) {
              return (
                <div key={`vazio-${idx}`}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/40 p-2.5 text-sm">
                  <Hourglass className="size-4 text-muted-foreground/60 shrink-0" />
                  <span className="flex-1 text-xs text-muted-foreground italic truncate">
                    Aguardando jogador... (vira bot)
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                    Slot {idx + 1}
                  </span>
                </div>
              );
            }
            return (
              <div key={j.id} className={cn(
                "flex items-center gap-2 rounded-lg border bg-card p-2.5 text-sm",
                j.user_id === user?.id && "border-primary/60",
              )}>
                <span className="text-base shrink-0 leading-none">{j.bandeira ?? "🏳️"}</span>
                {j.user_id === sala.mestre_id
                  ? <Crown className="size-4 text-legendary shrink-0" />
                  : j.is_cpu ? <Bot className="size-4 text-muted-foreground shrink-0" />
                  : <div className="size-4 rounded-full bg-secondary shrink-0" />}
                <span className="flex-1 font-bold truncate">{j.nome}</span>
                {j.pronto || j.is_cpu
                  ? <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-primary">
                      <Check className="size-3" /> Pronto
                    </span>
                  : <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Aguardando...</span>}
                {ehMestre && j.user_id !== sala.mestre_id && (
                  <button onClick={() => expulsar(j)} className="ml-1 text-destructive">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="space-y-2">
        {meu && !meu.is_cpu && (
          <Button onClick={togglePronto}
            variant={meu.pronto ? "outline" : "default"}
            className="w-full h-12 font-display uppercase tracking-widest font-black">
            <Check className="size-4 mr-2" /> {meu.pronto ? "Cancelar pronto" : "Estou pronto"}
          </Button>
        )}
        {ehMestre && (
          <Button onClick={iniciar} disabled={!podeIniciar}
            className="w-full h-12 font-display uppercase tracking-widest font-black bg-primary">
            <Play className="size-4 mr-2" /> Iniciar partida
          </Button>
        )}
        <Button onClick={sair} variant="ghost" className="w-full text-destructive font-bold uppercase tracking-widest text-xs">
          <LogOut className="size-4 mr-2" /> {ehMestre ? "Cancelar sala" : "Abandonar sala"}
        </Button>
      </div>

      <ChatPlaceholder />
    </div>
  );
}
