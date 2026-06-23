import type { Jogador } from "@/lib/selecoes";
import { cn } from "@/lib/utils";

interface Props {
  jogador: Jogador;
  esconderForca?: boolean;
  esconderRaridade?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  selecionado?: boolean;
  compact?: boolean;
  /** "card" (padrão, grande) ou "list" (linha única, bem mais compacta — ideal para listas longas de draft) */
  variant?: "card" | "list";
}

const gradientes: Record<string, string> = {
  comum: "from-common to-slate-900",
  raro: "from-rare to-slate-900",
  epico: "from-epic to-slate-900",
  lendario: "from-legendary to-slate-900",
};
const texto: Record<string, string> = {
  comum: "text-common",
  raro: "text-rare",
  epico: "text-epic",
  lendario: "text-legendary",
};
const glow: Record<string, string> = {
  comum: "",
  raro: "glow-rare",
  epico: "glow-epic",
  lendario: "glow-legendary",
};
const labelRar: Record<string, string> = {
  comum: "COMUM",
  raro: "RARO",
  epico: "ÉPICO",
  lendario: "LENDÁRIO",
};
const borda: Record<string, string> = {
  comum: "border-common", raro: "border-rare", epico: "border-epic", lendario: "border-legendary",
};

const GRADIENTE_NEUTRO = "from-muted-foreground/40 to-slate-900";
const TEXTO_NEUTRO = "text-muted-foreground";
const BORDA_NEUTRA = "border-muted-foreground/40";

export function PlayerCard({ jogador, esconderForca, esconderRaridade, onClick, disabled, selecionado, compact, variant = "card" }: Props) {
  const corGradiente = esconderRaridade ? GRADIENTE_NEUTRO : gradientes[jogador.raridade];
  const corTexto = esconderRaridade ? TEXTO_NEUTRO : texto[jogador.raridade];
  const corGlow = esconderRaridade ? "" : glow[jogador.raridade];
  const corBorda = esconderRaridade ? BORDA_NEUTRA : borda[jogador.raridade];

  if (variant === "list") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border-l-4 bg-card py-1.5 pl-2.5 pr-2 text-left transition-all",
          corBorda,
          !disabled && "active:scale-[0.98] hover:bg-secondary/60",
          selecionado && "ring-2 ring-primary bg-primary/5",
          disabled && "opacity-50",
        )}
      >
        <span className="font-display text-xs text-muted-foreground w-6 shrink-0 text-center">#{jogador.numero}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="font-display font-bold uppercase italic tracking-tight text-foreground truncate text-[13px] leading-tight">
              {jogador.nome}
            </h4>
            {!esconderRaridade && (
              <span className={cn("shrink-0 text-[8px] font-bold uppercase tracking-widest", corTexto)}>
                {labelRar[jogador.raridade]}
              </span>
            )}
          </div>
          <p className={cn("text-[9px] font-bold uppercase tracking-widest", corTexto)}>
            {jogador.posicao}
          </p>
        </div>
        {!esconderForca ? (
          <span className="font-display text-lg font-black leading-none text-foreground shrink-0">{jogador.forca}</span>
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/40 text-[10px] text-muted-foreground">?</span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-full rounded-2xl bg-gradient-to-br p-px text-left transition-all",
        corGradiente,
        !disabled && "active:scale-[0.98] hover:scale-[1.02]",
        selecionado && "ring-2 ring-primary",
        corGlow,
        disabled && "opacity-50",
      )}
    >
      <div className={cn("rounded-2xl bg-card flex flex-col gap-2", compact ? "p-3" : "p-4")}>
        <div className="flex items-start justify-between">
          <span className={cn("font-display font-bold uppercase tracking-tight text-[10px]", corTexto)}>
            {esconderRaridade ? "?????" : labelRar[jogador.raridade]}
          </span>
          <span className="font-display text-lg text-muted-foreground leading-none">#{jogador.numero}</span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className={cn("font-display font-bold uppercase italic tracking-tight text-foreground truncate", compact ? "text-base" : "text-xl")}>
              {jogador.nome}
            </h4>
            <p className={cn("text-xs font-bold uppercase tracking-widest", corTexto)}>
              {jogador.posicao}
            </p>
          </div>
          {!esconderForca && (
            <div className="text-right">
              <div className="text-[9px] uppercase text-muted-foreground tracking-widest">Força</div>
              <div className="font-display text-3xl font-black leading-none text-foreground">{jogador.forca}</div>
            </div>
          )}
          {esconderForca && (
            <div className="grid size-10 place-items-center rounded-full border-2 border-dashed border-muted-foreground/40 text-muted-foreground">
              ?
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
