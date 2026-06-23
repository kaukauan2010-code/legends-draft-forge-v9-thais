import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useConquistas } from "@/lib/useConquistas";
import { CONQUISTAS } from "@/lib/conquistas";
import { CampanhaCard } from "@/components/CampanhaCard";
import { Trophy, Swords, Flame, Medal, X } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Início — World Cup Draft" }] }),
  component: Dashboard,
});

type FiltroPainel = "partidas" | "vitorias" | "titulos" | null;

function Dashboard() {
  const { user } = useAuth();
  const { totalDesbloqueadas } = useConquistas();
  const [painelAberto, setPainelAberto] = useState<FiltroPainel>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: campanhas } = useQuery({
    queryKey: ["campanhas-dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("partidas")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const todas = campanhas ?? [];
  const vitoriosas = todas.filter(p => p.fase_alcancada !== "grupos" && p.fase_alcancada !== "eliminado");
  const campeas = todas.filter(p => p.campeao);

  const stats = { total: todas.length, vitorias: vitoriosas.length, titulos: campeas.length };

  const listaDoPainel =
    painelAberto === "partidas" ? todas :
    painelAberto === "vitorias" ? vitoriosas :
    painelAberto === "titulos" ? campeas : [];

  const tituloDoPainel =
    painelAberto === "partidas" ? "Todas as partidas" :
    painelAberto === "vitorias" ? "Vitórias" :
    painelAberto === "titulos" ? "Títulos conquistados" : "";

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5 relative">
      {/* Glow ambient */}
      <div className="pointer-events-none absolute -top-10 -left-10 w-[80%] h-40 bg-cyan-500/10 blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute top-40 -right-10 w-[80%] h-40 bg-purple-500/10 blur-[120px] rounded-full" />

      <header className="relative z-10 flex items-center gap-4 pt-2">
        <div className="relative">
          <div className="absolute inset-0 bg-primary blur-[8px] opacity-30 rounded-full animate-pulse" />
          <div className="relative size-16 rounded-full border-2 border-primary p-1 bg-background">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="size-full rounded-full object-cover" />
            ) : (
              <div className="size-full rounded-full bg-gradient-to-br from-primary/30 to-background grid place-items-center font-display text-xl font-black text-primary">
                {(profile?.display_name ?? "T")[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-primary text-[8px] font-black text-primary-foreground px-1 uppercase tracking-tighter rounded-sm">Active</div>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-base font-bold tracking-wider uppercase truncate">{profile?.display_name ?? "Treinador"}</h1>
          <p className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-bold mt-1">Team Commander</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-widest text-primary font-bold mb-1">Títulos</p>
          <p className="font-display text-3xl font-black leading-none">{stats.titulos}</p>
        </div>
      </header>

      <section className="relative z-10 grid grid-cols-2 gap-3">
        <HudStatCard icon={Swords} label="Partidas" value={stats.total} accent="cyan" onClick={() => setPainelAberto("partidas")} />
        <HudStatCard icon={Flame} label="Vitórias" value={stats.vitorias} accent="purple" onClick={() => setPainelAberto("vitorias")} />
        <HudStatCard icon={Trophy} label="Mundiais" value={stats.titulos} accent="cyan" onClick={() => setPainelAberto("titulos")} />
        <Link to="/conquistas" className="block">
          <HudStatCard icon={Medal} label="Conquistas" value={`${totalDesbloqueadas}`} suffix={`/${CONQUISTAS.length}`} accent="purple" progress={totalDesbloqueadas / CONQUISTAS.length} />
        </Link>
      </section>

      <Link to="/jogar" className="relative z-10 block group">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-epic to-primary bg-[length:200%_100%] animate-[hud-gradient_3s_linear_infinite]" />
          <div className="relative m-[2px] bg-background py-5 flex flex-col items-center group-active:bg-transparent transition-colors">
            <span className="font-display text-xl font-black italic tracking-tighter uppercase group-active:text-background">Jogar Sozinho</span>
            <span className="text-[10px] tracking-[0.4em] text-muted-foreground uppercase font-black mt-1 group-active:text-background/60">Draft • Simule • Conquiste</span>
          </div>
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-foreground" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-foreground" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-foreground" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-foreground" />
        </div>
      </Link>

      <Link to="/online" className="relative z-10 block group">
        <div className="relative overflow-hidden border border-primary/40 bg-primary/5 p-5 flex flex-col items-center transition-colors group-hover:border-primary">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary mb-1">Multiplayer Protocol</p>
          <p className="font-display text-lg italic font-black uppercase tracking-tight">Jogar Online</p>
          <p className="text-[10px] tracking-[0.3em] text-muted-foreground uppercase font-bold mt-1">Crie ou entre numa sala</p>
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-primary" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-primary" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-primary" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-primary" />
        </div>
      </Link>


      <style>{`@keyframes hud-gradient {0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>

      {painelAberto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background animate-enter">
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <h2 className="font-display text-xl uppercase italic tracking-tight">{tituloDoPainel}</h2>
            <button onClick={() => setPainelAberto(null)} className="rounded-full p-1.5 hover:bg-secondary">
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-10">
            {!listaDoPainel.length && (
              <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                Nada por aqui ainda.
              </div>
            )}
            {listaDoPainel.map(p => (
              <CampanhaCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps { icon: any; label: string; value: number | string; suffix?: string; accent?: "cyan" | "purple"; progress?: number }

function HudStatCard({ icon: Icon, label, value, suffix, accent = "cyan", progress, onClick }: StatCardProps & { onClick?: () => void }) {
  const accentClass = accent === "purple" ? "text-epic" : "text-primary";
  const bgAccent = accent === "purple" ? "bg-epic/10" : "bg-primary/10";
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="relative w-full bg-white/[0.03] border border-border/60 p-4 text-left overflow-hidden transition-colors hover:border-primary/60 active:scale-[0.98]"
    >
      <div className={`absolute top-0 right-0 w-8 h-8 skew-x-[45deg] translate-x-4 -translate-y-4 ${bgAccent}`} />
      <div className="relative z-10">
        <Icon className={`size-4 ${accentClass} mb-3`} />
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-1">{label}</p>
        <div className="flex items-end gap-1">
          <p className="font-display text-2xl font-bold leading-none">{value}</p>
          {suffix && <p className="text-xs text-muted-foreground font-bold mb-0.5">{suffix}</p>}
        </div>
        {progress !== undefined && (
          <div className="mt-3 w-full h-[2px] bg-foreground/5">
            <div className={`h-full ${accent === "purple" ? "bg-epic shadow-[0_0_8px_var(--color-epic)]" : "bg-primary shadow-[0_0_8px_var(--color-primary)]"}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
    </Comp>
  );
}

