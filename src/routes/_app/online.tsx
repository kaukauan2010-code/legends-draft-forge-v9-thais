import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Globe, Users, Trophy, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/online")({
  head: () => ({ meta: [{ title: "Online — World Cup Draft" }] }),
  component: Online,
});

type Competicao = "oitavas" | "final" | "copa";
const COMPETICOES: { id: Competicao; label: string; vagas: number; icone: typeof Trophy; desc: string }[] = [
  { id: "copa",    label: "Copa inteira",     vagas: 32, icone: Trophy, desc: "Fase de grupos + mata-mata completo" },
  { id: "oitavas", label: "Oitavas direto",   vagas: 16, icone: Swords, desc: "Pula a fase de grupos" },
  { id: "final",   label: "Final direta",     vagas: 2,  icone: Users,  desc: "1 contra 1, partida única" },
];
type Modo = "classico" | "almanaque";

function gerarCodigo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function Online() {
  const { user, isAnonymous } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"criar" | "entrar">("criar");
  const [comp, setComp] = useState<Competicao>("copa");
  const [modo, setModo] = useState<Modo>("classico");
  const [codigoEntrar, setCodigoEntrar] = useState("");
  const [nomeVisitante, setNomeVisitante] = useState("");
  const [busy, setBusy] = useState(false);

  const meuNome =
    (isAnonymous ? nomeVisitante.trim() : user?.user_metadata?.full_name)
    || user?.email?.split("@")[0]
    || nomeVisitante.trim()
    || "Visitante";

  const criar = async () => {
    if (!user) { toast.error("Faça login para criar sala"); return; }
    if (isAnonymous && !nomeVisitante.trim()) { toast.error("Informe seu nome antes de criar a sala"); return; }
    setBusy(true);
    const competicao = COMPETICOES.find(c => c.id === comp)!;
    try {
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const codigo = gerarCodigo();
        const { data, error } = await supabase.from("salas").insert({
          codigo, mestre_id: user.id, modo, competicao: comp, max_jogadores: competicao.vagas,
        }).select("id, codigo").single();
        if (!error && data) {
          const { error: jErr } = await supabase.from("sala_jogadores").insert({
            sala_id: data.id, user_id: user.id, nome: meuNome, slot: 1,
          });
          if (jErr) {
            console.error("[online] erro ao entrar como mestre", jErr);
            toast.error(`Sala criada, mas falhou ao entrar: ${jErr.message}`);
            setBusy(false);
            return;
          }
          setBusy(false);
          navigate({ to: "/online/$codigo", params: { codigo: data.codigo } });
          return;
        }
        console.warn("[online] tentativa de criar sala falhou", { tentativa, error });
        if (error && !String(error.message).toLowerCase().includes("duplicate")) {
          setBusy(false);
          toast.error(`Erro ao criar sala: ${error.message}`);
          return;
        }
      }
      setBusy(false);
      toast.error("Não consegui gerar um código único. Tente de novo.");
    } catch (e: any) {
      console.error("[online] exceção em criar()", e);
      setBusy(false);
      toast.error(`Erro inesperado: ${e?.message ?? e}`);
    }
  };

  const entrar = async () => {
    const cod = codigoEntrar.trim().toUpperCase();
    if (cod.length !== 4) { toast.error("Código tem 4 caracteres"); return; }
    if (!user) { toast.error("Sessão expirada — entre novamente."); return; }
    if (isAnonymous && !nomeVisitante.trim()) { toast.error("Informe seu nome antes de entrar"); return; }
    setBusy(true);
    const { data: sala } = await supabase.from("salas").select("id, codigo, status, max_jogadores").eq("codigo", cod).maybeSingle();
    if (!sala) { setBusy(false); toast.error("Sala não encontrada"); return; }
    if (sala.status !== "lobby") { setBusy(false); toast.error("Sala já iniciou"); return; }
    const { data: jogs } = await supabase.from("sala_jogadores").select("slot, user_id").eq("sala_id", sala.id);
    if (jogs?.some(j => j.user_id === user.id)) {
      setBusy(false);
      navigate({ to: "/online/$codigo", params: { codigo: sala.codigo } });
      return;
    }
    if ((jogs?.length ?? 0) >= sala.max_jogadores) { setBusy(false); toast.error("Sala cheia"); return; }
    const usados = new Set((jogs ?? []).map(j => j.slot));
    let proxSlot = 1;
    while (usados.has(proxSlot)) proxSlot++;
    const { error } = await supabase.from("sala_jogadores").insert({
      sala_id: sala.id, user_id: user.id, nome: meuNome, slot: proxSlot,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/online/$codigo", params: { codigo: sala.codigo } });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-10 animate-enter">
      <header className="text-center">
        <Globe className="mx-auto size-10 text-primary mb-2" />
        <h1 className="font-display text-3xl uppercase italic tracking-tight">Multiplayer</h1>
        <p className="text-sm text-muted-foreground mt-1">Jogue contra seus amigos em tempo real</p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {(["criar","entrar"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            "rounded-lg border py-2 text-xs font-bold uppercase tracking-widest",
            tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
          )}>{t === "criar" ? "Criar sala" : "Entrar com código"}</button>
        ))}
      </div>

      {tab === "criar" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Tipo de competição</div>
            <div className="space-y-2">
              {COMPETICOES.map(c => {
                const Icon = c.icone;
                return (
                  <button key={c.id} onClick={() => setComp(c.id)} className={cn(
                    "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors",
                    comp === c.id ? "border-primary" : "border-border",
                  )}>
                    <Icon className={cn("size-6 shrink-0", comp === c.id ? "text-primary" : "text-muted-foreground")} />
                    <div className="flex-1 min-w-0">
                      <div className="font-display uppercase text-sm font-bold">{c.label}</div>
                      <div className="text-[11px] text-muted-foreground">{c.desc}</div>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{c.vagas} vagas</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Modo do draft</div>
            <div className="grid grid-cols-2 gap-2">
              {(["classico","almanaque"] as Modo[]).map(m => (
                <button key={m} onClick={() => setModo(m)} className={cn(
                  "rounded-lg border py-2.5 text-xs font-bold uppercase tracking-widest",
                  modo === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
                )}>{m}</button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Todos os jogadores da sala vão jogar no modo que o mestre escolher.
            </p>
          </div>

          {isAnonymous && (
            <div className="space-y-1.5">
              <Label htmlFor="nomev1">Seu nome (visitante)</Label>
              <Input id="nomev1" value={nomeVisitante} onChange={e => setNomeVisitante(e.target.value)} placeholder="Como os outros vão te ver" />
            </div>
          )}
          <Button onClick={criar} disabled={busy || !user} className="w-full h-12 font-display uppercase tracking-widest font-black">
            Criar sala
          </Button>
          {!user && (
            <p className="text-xs text-destructive text-center space-x-2">
              <span>Faça login para criar salas.</span>
              <Link to="/auth" className="underline font-bold">Entrar</Link>
            </p>
          )}
        </div>
      )}

      {tab === "entrar" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cod">Código da sala</Label>
            <Input id="cod" value={codigoEntrar} maxLength={4}
              onChange={e => setCodigoEntrar(e.target.value.toUpperCase())}
              placeholder="AB12" className="font-mono text-center text-2xl tracking-widest" />
          </div>
          {isAnonymous && (
            <div className="space-y-1.5">
              <Label htmlFor="nomev2">Seu nome (visitante)</Label>
              <Input id="nomev2" value={nomeVisitante} onChange={e => setNomeVisitante(e.target.value)} placeholder="Como os outros vão te ver" />
            </div>
          )}
          <Button onClick={entrar} disabled={busy} className="w-full h-12 font-display uppercase tracking-widest font-black">
            Entrar
          </Button>
        </div>
      )}
    </div>
  );
}
