import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Copy, Check, X, Crown, Bot, Plus, Play } from "lucide-react";

export const Route = createFileRoute("/_app/online/$codigo")({
  component: SalaLobby,
});

interface Sala {
  id: string; codigo: string; mestre_id: string;
  modo: "classico" | "almanaque"; competicao: "oitavas" | "final" | "copa";
  velocidade: "normal" | "rapida" | "ultra"; status: string; max_jogadores: number;
}
interface Jogador {
  id: string; sala_id: string; user_id: string | null; nome: string;
  is_cpu: boolean; pronto: boolean; slot: number;
}

function SalaLobby() {
  const { codigo } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sala, setSala] = useState<Sala | null>(null);
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [loading, setLoading] = useState(true);

  // carrega sala + jogadores e ouve mudanças em tempo real
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

  if (loading || !sala) {
    return <div className="grid min-h-[60vh] place-items-center text-muted-foreground text-sm">Carregando sala...</div>;
  }

  const ehMestre = user?.id === sala.mestre_id;
  const meu = jogadores.find(j => j.user_id === user?.id);
  const todosProntos = jogadores.length > 0 && jogadores.every(j => j.pronto || j.is_cpu);
  const minComecar = sala.competicao === "final" ? 2 : 2; // mínimo de 2 humanos para começar
  const humanos = jogadores.filter(j => !j.is_cpu).length;

  const copiarCodigo = async () => {
    await navigator.clipboard.writeText(sala.codigo);
    toast.success("Código copiado");
  };

  const togglePronto = async () => {
    if (!meu) return;
    await supabase.from("sala_jogadores").update({ pronto: !meu.pronto }).eq("id", meu.id);
  };

  const adicionarCpu = async () => {
    if (!ehMestre || jogadores.length >= sala.max_jogadores) return;
    const usados = new Set(jogadores.map(j => j.slot));
    let slot = 1;
    while (usados.has(slot)) slot++;
    const nomesCpu = ["CPU Alpha","CPU Bravo","CPU Charlie","CPU Delta","CPU Echo","CPU Foxtrot","CPU Golf","CPU Hotel"];
    const nome = nomesCpu[(jogadores.filter(j=>j.is_cpu).length) % nomesCpu.length];
    await supabase.from("sala_jogadores").insert({
      sala_id: sala.id, user_id: null, nome, is_cpu: true, pronto: true, slot,
    });
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

  const atualizarConfig = async (campo: "modo" | "competicao" | "velocidade", valor: string) => {
    if (!ehMestre) return;
    const update: Partial<Sala> = { [campo]: valor as any } as any;
    if (campo === "competicao") {
      update.max_jogadores = valor === "final" ? 2 : valor === "oitavas" ? 16 : 32;
    }
    await supabase.from("salas").update(update).eq("id", sala.id);
  };

  const iniciar = async () => {
    if (!ehMestre) return;
    if (humanos < minComecar) { toast.error(`Mínimo ${minComecar} jogadores humanos`); return; }
    if (!todosProntos) { toast.error("Aguarde todos apertarem 'pronto'"); return; }
    // Distribui grupos uniformemente. Total de slots na competição = max_jogadores;
    // para "copa"=32 → 8 grupos (A-H, 4 cada); "oitavas"=16 → 2 por grupo; "final"=2 → sem grupo
    // Se sala não estiver cheia, completa com CPU até max_jogadores; ímpar começa no grupo A.
    const grupos = ["A","B","C","D","E","F","G","H"];
    const max = sala.max_jogadores;
    const faltam = max - jogadores.length;
    const usados = new Set(jogadores.map(j => j.slot));
    const novosCpu: any[] = [];
    let slot = 1;
    for (let i = 0; i < faltam; i++) {
      while (usados.has(slot)) slot++;
      usados.add(slot);
      novosCpu.push({ sala_id: sala.id, user_id: null, nome: `CPU ${slot}`, is_cpu: true, pronto: true, slot });
    }
    if (novosCpu.length) await supabase.from("sala_jogadores").insert(novosCpu);

    // Recarrega para distribuir grupos
    const { data: jAll } = await supabase.from("sala_jogadores").select("*").eq("sala_id", sala.id).order("slot");
    const todos = (jAll ?? []) as Jogador[];

    if (sala.competicao !== "final") {
      const qtdGrupos = sala.competicao === "oitavas" ? 8 : 8;
      // distribui uniformemente um por grupo, depois volta — ímpares começam pelo A.
      const updates = todos.map((j, idx) => ({ id: j.id, grupo: grupos[idx % qtdGrupos] }));
      // o update precisa ser feito linha a linha
      for (const u of updates) {
        await supabase.from("sala_jogadores").update({ grupo: u.grupo }).eq("id", u.id);
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
        <p className="text-xs text-muted-foreground">Envie esse código pros seus amigos</p>
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
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Velocidade</div>
            <div className="grid grid-cols-3 gap-1">
              {(["normal","rapida","ultra"] as const).map(v => (
                <button key={v} disabled={!ehMestre}
                  onClick={() => atualizarConfig("velocidade", v)}
                  className={cn("rounded border py-1.5 text-[10px] font-bold uppercase tracking-widest",
                    sala.velocidade === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
                    !ehMestre && "opacity-60 cursor-not-allowed",
                  )}>{v}</button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">{labelComp} · até {sala.max_jogadores} jogadores</p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display uppercase text-sm tracking-widest text-muted-foreground">
            Jogadores ({jogadores.length}/{sala.max_jogadores})
          </h2>
          {ehMestre && jogadores.length < sala.max_jogadores && (
            <button onClick={adicionarCpu} className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-primary">
              <Plus className="size-3" /> CPU
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {jogadores.map(j => (
            <div key={j.id} className={cn(
              "flex items-center gap-2 rounded-lg border bg-card p-2.5 text-sm",
              j.user_id === user?.id && "border-primary/60",
            )}>
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
          ))}
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
          <Button onClick={iniciar} disabled={!todosProntos || humanos < minComecar}
            className="w-full h-12 font-display uppercase tracking-widest font-black bg-primary">
            <Play className="size-4 mr-2" /> Iniciar partida
          </Button>
        )}
        <Button onClick={sair} variant="ghost" className="w-full text-destructive font-bold uppercase tracking-widest text-xs">
          {ehMestre ? "Cancelar sala" : "Sair da sala"}
        </Button>
      </div>

      <div className="text-center text-[10px] text-muted-foreground">
        ⚠ Multiplayer fase 1: lobby + salas funcionando. Draft simultâneo e torneio online vêm nas próximas atualizações.
      </div>
    </div>
  );
}
