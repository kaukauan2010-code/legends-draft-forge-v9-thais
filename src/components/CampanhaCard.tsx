import { useState } from "react";
import { Trophy, Skull, ChevronDown, Zap, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventoJogo, ResultadoPenaltis } from "@/lib/simulador";

export interface RodadaSalva {
  fase: string;
  texto: string;
  resultado: { eventos: EventoJogo[]; golsCasa: number; golsFora: number };
  minhaVitoria: boolean;
  penaltis?: ResultadoPenaltis;
}

export function tituloFaseCampanha(f: string): string {
  return {
    grupos: "Fase de Grupos", oitavas: "Oitavas de Final", quartas: "Quartas de Final",
    semi: "Semifinal", final: "Final", campeao: "🏆 Campeão", eliminado: "Eliminado",
  }[f] ?? f;
}

export function CampanhaCard({ p }: { p: any }) {
  const [aberto, setAberto] = useState(false);
  const rodadas: RodadaSalva[] = Array.isArray(p.log) ? p.log : [];

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", p.campeao ? "border-legendary" : "border-border")}>
      <button type="button" onClick={() => setAberto(v => !v)} className="w-full text-left p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {p.campeao ? <Trophy className="size-4 text-legendary" /> : p.fase_alcancada === "eliminado" ? <Skull className="size-4 text-destructive" /> : null}
              <span className="font-display uppercase tracking-tight font-bold">{tituloFaseCampanha(p.fase_alcancada)}</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              {p.modo} · {p.formacao} · {p.estrategia}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{new Date(p.created_at).toLocaleString("pt-BR")}</div>
          </div>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform mt-1", aberto && "rotate-180")} />
        </div>
      </button>

      {aberto && (
        <div className="border-t border-border/60 px-4 py-3 space-y-2 animate-enter">
          {!rodadas.length && (
            <p className="text-xs text-muted-foreground italic">Sem detalhes de rodada salvos para esta campanha.</p>
          )}
          {rodadas.map((h, i) => (
            <RodadaDetalheCampanha key={i} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function RodadaDetalheCampanha({ h }: { h: RodadaSalva }) {
  const [aberto, setAberto] = useState(false);
  const eventosOrdenados = [...(h.resultado?.eventos ?? [])].sort((a, b) => a.minuto - b.minuto);
  const rodadasPenalti = h.penaltis
    ? Array.from(new Set(h.penaltis.cobrancas.map(c => c.rodada))).sort((a, b) => a - b).map(rodada => ({
        rodada,
        casa: h.penaltis!.cobrancas.find(c => c.rodada === rodada && c.time === "casa"),
        fora: h.penaltis!.cobrancas.find(c => c.rodada === rodada && c.time === "fora"),
      }))
    : [];

  return (
    <div className={cn("rounded-lg border bg-secondary/40 overflow-hidden", h.minhaVitoria ? "border-primary/30" : "border-destructive/20")}>
      <button type="button" onClick={() => setAberto(v => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground shrink-0">{h.fase}</span>
        <span className="font-bold flex-1 truncate text-right mr-1">{h.texto}</span>
        <ChevronDown className={cn("size-3 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="border-t border-border/40 px-3 py-2 space-y-2">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
              <Zap className="size-3" /> Lance a lance
            </div>
            <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
              {eventosOrdenados.map((e, i) => (
                <div key={i} className={cn(
                  "text-[10px] leading-snug",
                  e.tipo === "gol" && "font-bold text-primary",
                  e.tipo === "cartao" && "text-yellow-500",
                  e.tipo === "info" && "text-muted-foreground italic",
                )}>
                  {e.texto}
                </div>
              ))}
            </div>
          </div>
          {h.penaltis && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="size-3" /> Pênaltis · {h.penaltis.golsCasa}-{h.penaltis.golsFora}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-1">
                <div className="text-[8px] uppercase tracking-widest text-muted-foreground text-center">Casa</div>
                <div className="text-[8px] uppercase tracking-widest text-muted-foreground text-center">Fora</div>
              </div>
              <div className="space-y-1">
                {rodadasPenalti.map(({ rodada, casa, fora }) => (
                  <div key={rodada} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[10px]">
                    <div className="flex items-center justify-end gap-1 text-right">
                      <span className="font-medium truncate">{casa?.jogador ?? "—"}</span>
                      <span className={casa?.acertou ? "text-primary" : "text-destructive"}>
                        {casa ? (casa.acertou ? "⚽" : "❌") : ""}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground text-[8px] px-1">
                      {casa?.placarCasa ?? "·"}-{fora?.placarFora ?? "·"}
                    </span>
                    <div className="flex items-center justify-start gap-1 text-left">
                      <span className={fora?.acertou ? "text-primary" : "text-destructive"}>
                        {fora ? (fora.acertou ? "⚽" : "❌") : ""}
                      </span>
                      <span className="font-medium truncate">{fora?.jogador ?? "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
