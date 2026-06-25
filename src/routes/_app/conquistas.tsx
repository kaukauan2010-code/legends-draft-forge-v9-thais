import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useConquistas } from "@/lib/useConquistas";
import { CONQUISTAS, type CategoriaConquista } from "@/lib/conquistas";
import { cn } from "@/lib/utils";
import {
  Trophy, Target, Crown, Zap, Crosshair, Star, BookOpen, LayoutGrid,
  ShieldHalf, Equal, Lock, CheckCircle2, LogIn,
} from "lucide-react";

export const Route = createFileRoute("/_app/conquistas")({
  head: () => ({ meta: [{ title: "Conquistas — World Cup Draft" }] }),
  component: Conquistas,
});

const CATEGORIA_INFO: Record<CategoriaConquista, { label: string; icon: typeof Trophy }> = {
  vitorias: { label: "Vitórias", icon: Trophy },
  gols: { label: "Gols", icon: Target },
  titulos: { label: "Títulos", icon: Crown },
  sequencias: { label: "Sequências", icon: Zap },
  penaltis: { label: "Pênaltis", icon: Crosshair },
  draft: { label: "Draft", icon: Star },
  modos: { label: "Modos de Jogo", icon: BookOpen },
  variedade: { label: "Variedade", icon: LayoutGrid },
  defesa: { label: "Defesa", icon: ShieldHalf },
  especiais: { label: "Especiais", icon: Equal },
};

const TIER_COR: Record<string, string> = {
  bronze: "border-common text-foreground",
  prata: "border-rare text-rare",
  ouro: "border-epic text-epic",
  platina: "border-legendary text-legendary",
  lendaria: "border-legendary text-legendary",
};

function Conquistas() {
  const { isAnonymous } = useAuth();
  const { conquistas, totalDesbloqueadas, carregando } = useConquistas();
  const [filtro, setFiltro] = useState<CategoriaConquista | "todas">("todas");

  if (isAnonymous) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 space-y-4 text-center">
        <h1 className="font-display text-3xl uppercase italic tracking-tight">Conquistas</h1>
        <p className="text-sm text-muted-foreground">
          As conquistas só ficam guardadas em contas reais. Crie uma conta para começar a desbloqueá-las.
        </p>
        <Button asChild className="w-full h-11 font-bold uppercase tracking-widest">
          <Link to="/auth"><LogIn className="size-4 mr-1.5" /> Criar conta</Link>
        </Button>
      </div>
    );
  }


  const categorias = useMemo(() => {
    const ids = new Set(CONQUISTAS.map(c => c.categoria));
    return Array.from(ids);
  }, []);

  const listaFiltrada = filtro === "todas" ? conquistas : conquistas.filter(c => c.categoria === filtro);

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-24">
      <header>
        <h1 className="font-display text-3xl uppercase italic tracking-tight">Conquistas</h1>
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-bold">{totalDesbloqueadas}</span> de {CONQUISTAS.length} desbloqueadas
        </p>
        <div className="mt-2 h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-epic transition-all"
            style={{ width: `${(totalDesbloqueadas / CONQUISTAS.length) * 100}%` }}
          />
        </div>
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <FiltroChip ativo={filtro === "todas"} onClick={() => setFiltro("todas")} label="Todas" />
        {categorias.map(cat => (
          <FiltroChip
            key={cat}
            ativo={filtro === cat}
            onClick={() => setFiltro(cat)}
            label={CATEGORIA_INFO[cat].label}
          />
        ))}
      </div>

      {carregando && (
        <p className="text-center text-sm text-muted-foreground py-8">Carregando progresso...</p>
      )}

      {!carregando && (
        <div className="space-y-2">
          {listaFiltrada.map(c => {
            const Icon = c.desbloqueada ? CheckCircle2 : Lock;
            return (
              <div key={c.id}
                className={cn(
                  "rounded-xl border-l-4 bg-card p-3 transition-opacity",
                  c.desbloqueada ? TIER_COR[c.tier] : "border-border opacity-60",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={cn("size-5 shrink-0 mt-0.5", c.desbloqueada ? "text-primary" : "text-muted-foreground")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm truncate">{c.nome}</h3>
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground shrink-0">
                        {c.desbloqueada ? "1/1" : `0/1`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.descricao}</p>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-primary/70" style={{ width: c.desbloqueada ? "100%" : `${c.progresso * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FiltroChip({ ativo, onClick, label }: { ativo: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
        ativo ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}
