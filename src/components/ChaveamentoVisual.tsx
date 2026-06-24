import { useState } from "react";
import type { ConfrontoMata, ChaveMata } from "@/lib/campanha";
import { cn } from "@/lib/utils";
import { FlagEmoji } from "./FlagEmoji";

interface Props {
  chave: ChaveMata;
  faseAtual: "oitavas" | "quartas" | "semi" | "final";
}

const FASES_ORDEM: ("oitavas" | "quartas" | "semi" | "final")[] = ["oitavas", "quartas", "semi", "final"];
const CONFRONTOS_POR_FASE: Record<string, number> = {
  oitavas: 8, quartas: 4, semi: 2, final: 1,
};
const TITULO_FASE: Record<string, string> = {
  oitavas: "Oitavas", quartas: "Quartas", semi: "Semi", final: "Final",
};

function confrontosPlaceholder(qtd: number, prefixo: string): ConfrontoMata[] {
  return Array.from({ length: qtd }, (_, i) => ({ id: `${prefixo}-ph-${i}`, casa: null, fora: null }));
}

export function ChaveamentoVisual({ chave, faseAtual }: Props) {
  // Aba inicial: a fase atual em que o jogador está.
  const [abaAtiva, setAbaAtiva] = useState<typeof FASES_ORDEM[number]>(faseAtual);
  const idxAtual = FASES_ORDEM.indexOf(faseAtual);

  const confrontosDaAba = (() => {
    const reais = chave[abaAtiva];
    const qtdEsperada = CONFRONTOS_POR_FASE[abaAtiva] ?? 1;
    if (reais.length > 0 && (reais.length === qtdEsperada || abaAtiva === faseAtual)) {
      return reais;
    }
    return confrontosPlaceholder(qtdEsperada, abaAtiva);
  })();

  return (
    <div className="space-y-3">
      {/* Tabs por fase — toca pra trocar, cada uma mostra a fase inteira em grid */}
      <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-card p-1">
        {FASES_ORDEM.map((fase, idx) => {
          const ativa = abaAtiva === fase;
          const desbloqueada = idx <= idxAtual;
          return (
            <button
              key={fase}
              onClick={() => setAbaAtiva(fase)}
              className={cn(
                "rounded-md px-1 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
                ativa && "bg-primary text-primary-foreground",
                !ativa && desbloqueada && "text-foreground hover:bg-muted",
                !ativa && !desbloqueada && "text-muted-foreground/50",
              )}
            >
              {TITULO_FASE[fase]}
            </button>
          );
        })}
      </div>

      {/* Grid compacto de confrontos da fase selecionada */}
      <div className={cn(
        "grid gap-2",
        confrontosDaAba.length >= 8 && "grid-cols-2",
        confrontosDaAba.length === 4 && "grid-cols-2",
        confrontosDaAba.length === 2 && "grid-cols-2",
        confrontosDaAba.length === 1 && "grid-cols-1 max-w-xs mx-auto",
      )}>
        {confrontosDaAba.map((c) => (
          <BracketSlot key={c.id} confronto={c} />
        ))}
      </div>
    </div>
  );
}

function BracketSlot({ confronto }: { confronto: ConfrontoMata }) {
  const souEu = confronto.casa?.isCPU === false || confronto.fora?.isCPU === false;
  return (
    <div className={cn(
      "rounded-lg border bg-card text-[10px] overflow-hidden",
      souEu ? "border-primary" : "border-border",
    )}>
      <TimeLinha time={confronto.casa} venceu={!!confronto.vencedor && confronto.vencedor === confronto.casa} />
      <div className="h-px bg-border" />
      <TimeLinha time={confronto.fora} venceu={!!confronto.vencedor && confronto.vencedor === confronto.fora} />
    </div>
  );
}

function TimeLinha({ time, venceu }: { time: { nome: string; bandeira: string; isCPU: boolean } | null; venceu: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-2",
      venceu && "bg-primary/10 font-bold",
      time?.isCPU === false && "text-primary",
    )}>
      {time?.bandeira
        ? <FlagEmoji emoji={time.bandeira} size={14} className="shrink-0" />
        : <span className="shrink-0 text-[12px]">❔</span>
      }
      <span className="truncate flex-1">{time?.nome ?? "A definir"}</span>
    </div>
  );
}
