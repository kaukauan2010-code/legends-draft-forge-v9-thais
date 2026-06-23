import type { ConfrontoMata, ChaveMata } from "@/lib/campanha";
import { cn } from "@/lib/utils";

interface Props {
  chave: ChaveMata;
  faseAtual: "oitavas" | "quartas" | "semi" | "final";
}

const FASES_ORDEM: ("oitavas" | "quartas" | "semi" | "final")[] = ["oitavas", "quartas", "semi", "final"];
const TITULO_FASE: Record<string, string> = {
  oitavas: "Oitavas", quartas: "Quartas", semi: "Semifinal", final: "Final",
};

// Gera os confrontos "futuros" de uma fase ainda não montada, a partir da
// quantidade de confrontos da fase anterior (cada 2 jogos da fase anterior
// alimentam 1 jogo da próxima). Usado para desenhar os slots vazios do bracket
// antes deles serem definidos.
function confrontosPlaceholder(qtd: number, prefixo: string): ConfrontoMata[] {
  return Array.from({ length: qtd }, (_, i) => ({ id: `${prefixo}-ph-${i}`, casa: null, fora: null }));
}

export function ChaveamentoVisual({ chave, faseAtual }: Props) {
  const idxAtual = FASES_ORDEM.indexOf(faseAtual);
  // Mostra da fase atual até a final, preenchendo fases futuras ainda vazias
  // com placeholders proporcionais (8→4→2→1 confrontos).
  const colunas = FASES_ORDEM.slice(idxAtual).map((fase, i) => {
    const reais = chave[fase];
    if (reais.length > 0) return { fase, confrontos: reais };
    // calcula quantos confrontos essa fase deveria ter com base na fase atual
    const qtdEsperada = chave[faseAtual].length / Math.pow(2, i);
    return { fase, confrontos: confrontosPlaceholder(Math.max(1, Math.round(qtdEsperada)), fase) };
  });

  return (
    <div className="overflow-x-auto pb-2 -mx-4 px-4">
      <div className="flex gap-6 min-w-max">
        {colunas.map((coluna, colIdx) => (
          <div key={coluna.fase} className="flex flex-col justify-around gap-4" style={{ minWidth: 150 }}>
            <div className="text-center text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
              {TITULO_FASE[coluna.fase]}
            </div>
            <div className="flex flex-1 flex-col justify-around gap-6">
              {coluna.confrontos.map((c, i) => (
                <BracketSlot key={c.id} confronto={c} naoEUltimaColuna={colIdx < colunas.length - 1} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketSlot({ confronto, naoEUltimaColuna }: { confronto: ConfrontoMata; naoEUltimaColuna: boolean }) {
  const souEu = confronto.casa?.isCPU === false || confronto.fora?.isCPU === false;
  return (
    <div className="relative">
      <div className={cn(
        "rounded-lg border bg-card text-[10px] overflow-hidden",
        souEu ? "border-primary" : "border-border",
      )}>
        <TimeLinha time={confronto.casa} venceu={!!confronto.vencedor && confronto.vencedor === confronto.casa} />
        <div className="h-px bg-border" />
        <TimeLinha time={confronto.fora} venceu={!!confronto.vencedor && confronto.vencedor === confronto.fora} />
      </div>
      {/* linha de conexão pra próxima fase, estilo chave de campeonato */}
      {naoEUltimaColuna && (
        <div className="absolute left-full top-1/2 h-px w-3 -translate-y-1/2 bg-border" />
      )}
    </div>
  );
}

function TimeLinha({ time, venceu }: { time: { nome: string; bandeira: string; isCPU: boolean } | null; venceu: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-2 py-1.5",
      venceu && "bg-primary/10 font-bold",
      time?.isCPU === false && "text-primary",
    )}>
      <span className="shrink-0">{time?.bandeira ?? "❔"}</span>
      <span className="truncate flex-1">{time?.nome ?? "A definir"}</span>
    </div>
  );
}
