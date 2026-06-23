import type { Formacao } from "@/lib/formacoes";
import type { Posicao } from "@/lib/selecoes";
import { posicoesCompativeis } from "@/lib/selecoes";
import type { JogadorEscalado } from "@/lib/simulador";
import { cn } from "@/lib/utils";

interface Props {
  formacao: Formacao;
  escalacao: JogadorEscalado[];
  slotAtivo?: string;
  posicaoAlvo?: Posicao;            // destaca todos os slots vazios dessa posição
  onSlotClick?: (slotId: string) => void;
  onJogadorClick?: (slotId: string) => void; // clique num jogador já escalado (ex: excluir)
  esconderRaridade?: boolean;       // modo almanaque: cor neutra até finalizar a escalação
}

const corRaridade: Record<string, string> = {
  comum: "bg-common/80 border-common",
  raro: "bg-rare/80 border-rare",
  epico: "bg-epic/80 border-epic",
  lendario: "bg-legendary/80 border-legendary",
};
const CINZA_NEUTRO = "bg-slate-700/80 border-slate-400";

export function MiniCampo({ formacao, escalacao, slotAtivo, posicaoAlvo, onSlotClick, onJogadorClick, esconderRaridade }: Props) {
  const ocupados = new Map(escalacao.map(j => [j.slotId, j]));
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border-4 border-white/10 shadow-inner"
         style={{ background: "linear-gradient(to bottom, var(--color-pitch) 0%, var(--color-pitch-dark) 100%)" }}>
      {/* linhas */}
      <div className="pointer-events-none absolute inset-2 rounded border border-white/25" />
      <div className="absolute inset-x-2 top-1/2 h-px bg-white/25" />
      <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      {/* áreas */}
      <div className="absolute left-1/2 top-2 h-8 w-2/5 -translate-x-1/2 border-x border-b border-white/25" />
      <div className="absolute left-1/2 bottom-2 h-8 w-2/5 -translate-x-1/2 border-x border-t border-white/25" />

      {formacao.slots.map(s => {
        const j = ocupados.get(s.id);
        const alvo = !j && !!posicaoAlvo && posicoesCompativeis(posicaoAlvo).includes(s.posicao);
        const ativo = slotAtivo === s.id;
        const clicavelVazio = alvo && !!onSlotClick;
        const clicavelOcupado = !!j && !!onJogadorClick;
        const clicavel = clicavelVazio || clicavelOcupado;
        const handleClick = clicavelVazio
          ? () => onSlotClick!(s.id)
          : clicavelOcupado
            ? () => onJogadorClick!(s.id)
            : undefined;
        return (
          <div
            key={s.id}
            role={clicavel ? "button" : undefined}
            tabIndex={clicavel ? 0 : undefined}
            onClick={handleClick}
            onKeyDown={clicavel ? (e) => { if (e.key === "Enter" || e.key === " ") handleClick?.(); } : undefined}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2",
              clicavel && "cursor-pointer",
            )}
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  "grid place-items-center rounded-full border-2 text-[10px] font-bold transition-all",
                  j ? (esconderRaridade ? CINZA_NEUTRO : corRaridade[j.raridade]) : "bg-slate-950/70 border-white/40",
                  j ? "size-9 text-white" : "size-8 text-white/70",
                  ativo && !j && "ring-2 ring-primary ring-offset-2 ring-offset-pitch animate-pulse",
                  alvo && "ring-2 ring-primary scale-125 bg-primary/40 border-primary animate-pulse cursor-pointer",
                )}
              >
                {j ? j.numero : s.label}
              </div>
              {j && (
                <span className="max-w-16 truncate rounded bg-slate-950/80 px-1 py-0.5 text-center text-[8px] font-bold uppercase leading-none text-white shadow">
                  {j.nome}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
