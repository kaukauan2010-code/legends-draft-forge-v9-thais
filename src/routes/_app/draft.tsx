// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCampanha } from "@/lib/campanha";
import { FORMACOES } from "@/lib/formacoes";
import { MiniCampo } from "@/components/MiniCampo";
import { Button } from "@/components/ui/button";
import { Dices, Shuffle, Shield, Sword, Star, Trash2, X, Lock, Zap } from "lucide-react";
import { toast } from "sonner";
import { statsEscalacao } from "@/lib/simulador";
import { RARIDADE_TEXT_CLASS, RARIDADE_BORDER_CLASS, RARIDADE_LABEL, posicoesCompativeis, SELECOES } from "@/lib/selecoes";
import { cn } from "@/lib/utils";
import { FlagEmoji } from "@/components/FlagEmoji";

export const Route = createFileRoute("/_app/draft")({
  head: () => ({ meta: [{ title: "Draft — World Cup Draft" }] }),
  component: Draft,
});

function Draft() {
  const navigate = useNavigate();
  const s = useCampanha();
  const [tempo, setTempo] = useState(30);
  const [slotParaExcluir, setSlotParaExcluir] = useState<string | null>(null);
  // Animação visual de sorteio: passa 10 seleções (bandeira + nome + ano) em ~1.5s
  const [sorteando, setSorteando] = useState<{ bandeira: string; nome: string; ano?: number | string } | null>(null);
  const sortearAnim = () => {
    if (sorteando || s.selecaoAtual || s.jogadorPendente) return;
    const pool = SELECOES.slice().sort(() => Math.random() - 0.5);
    const total = 10;
    const dur = 1500;
    let i = 0;
    const primeira = pool[0]!;
    setSorteando({ bandeira: primeira.bandeira, nome: primeira.nome, ano: primeira.ano });
    const tick = setInterval(() => {
      i++;
      if (i >= total) {
        clearInterval(tick);
        setSorteando(null);
        s.sortearProxima();
        return;
      }
      const cur = pool[i % pool.length]!;
      setSorteando({ bandeira: cur.bandeira, nome: cur.nome, ano: cur.ano });
    }, dur / total);
  };

  useEffect(() => {
    const decidir = () => {
      const st = useCampanha.getState();
      if (!st.ativa || !st.config) navigate({ to: "/jogar", replace: true });
    };
    if (useCampanha.persist.hasHydrated()) { decidir(); return; }
    const unsub = useCampanha.persist.onFinishHydration(decidir);
    return () => unsub();
  }, [navigate]);

  // reset timer APENAS quando muda a seleção sorteada
  useEffect(() => {
    setTempo(30);
  }, [s.selecaoAtual?.id]);

  // cronômetro: só corre quando há algo a decidir
  useEffect(() => {
    if (!s.selecaoAtual && !s.jogadorPendente) return;
    if (tempo <= 0) {
      s.forcarFimDraft();
      toast.warning("Tempo esgotado — escolha automática");
      return;
    }
    const t = setTimeout(() => setTempo(x => x - 1), 1000);
    return () => clearTimeout(t);
  }, [tempo, s.selecaoAtual, s.jogadorPendente]);

  // fim do draft → torneio. Guard com ref pra não disparar em loop quando o
  // estado da campanha muda dentro do mesmo render.
  const jaIniciouTorneio = useRef(false);
  useEffect(() => {
    if (jaIniciouTorneio.current) return;
    if (s.ativa && s.escalacao.length === 11) {
      jaIniciouTorneio.current = true;
      s.comecarTorneio();
      navigate({ to: "/torneio" });
    }
  }, [s.escalacao.length, s.ativa]);

  if (!s.config) return null;

  const formacao = FORMACOES[s.config.formacaoId];
  const posicoesLivres = new Set(s.slotsRestantes.map(sl => sl.posicao));
  const pendente = s.jogadorPendente;
  const stats = statsEscalacao(s.escalacao);
  const limiteTrocas = s.config.modo === "classico" ? 3 : 1;
  const limiteRerolls = s.config.modo === "classico" ? 3 : 1;

  // Lista de slots (ordenada da defesa pro ataque) para mostrar
  const slotsOrdenados = [...formacao.slots].sort((a, b) => b.y - a.y);
  const ocupados = new Map(s.escalacao.map(j => [j.slotId, j]));
  const jogadorParaExcluir = slotParaExcluir ? ocupados.get(slotParaExcluir) : undefined;

  const confirmarExclusao = () => {
    if (!slotParaExcluir) return;
    const ok = s.excluirJogador(slotParaExcluir);
    if (ok) {
      toast.success("Jogador removido. Escolha outro para o slot — seu reroll continua intacto.");
    } else {
      toast.error("Sem trocas disponíveis.");
    }
    setSlotParaExcluir(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-3 space-y-3">
      {/* HEADER compacto: stats + timer */}
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-destructive font-bold">Janela de Draft · Slot {s.escalacao.length}/11</div>
            <div className="text-[10px] text-muted-foreground">
              {pendente
                ? <>Clique no campo: slot <span className="font-bold text-primary">{pendente.posicao}</span></>
                : s.selecaoAtual
                  ? <>Escolha um jogador da seleção</>
                  : <>Aperte <span className="font-bold text-primary">SORTEAR</span> para a próxima seleção</>}
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <MiniStat icon={<Star className="size-2.5" />} label="Força" value={stats.forca} />
            <MiniStat icon={<Sword className="size-2.5" />} label="Atk" value={stats.ataque} />
            <MiniStat icon={<Shield className="size-2.5" />} label="Def" value={stats.defesa} />
            <div className="w-px h-6 bg-border" />
            <MiniStat icon={<Dices className="size-2.5" />} label="Rerolls" value={`${s.rerollsRestantes}/${limiteRerolls}`} />
            <MiniStat icon={<Trash2 className="size-2.5" />} label="Trocas" value={`${s.trocasRestantes}/${limiteTrocas}`} />
          </div>
        </div>
        {(s.selecaoAtual || pendente) && (
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-display text-base font-black tabular-nums shrink-0",
              tempo <= 10 ? "text-destructive animate-pulse" : "text-foreground",
            )}>
              00:{tempo.toString().padStart(2, "0")}
            </span>
            <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full transition-all duration-1000 ease-linear", tempo <= 10 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.max(0, Math.min(100, (tempo / 30) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* GRID PRINCIPAL: lista de seleção | campo | escalação */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr_220px] gap-3">


        {/* COL 1: Jogadores disponíveis da seleção sorteada */}
        <div className="rounded-xl border border-border bg-card p-2.5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
              {s.selecaoAtual ? "Escolha 1 jogador" : "Aguardando sorteio"}
            </h2>
            {s.selecaoAtual && (
              <Button
                variant="outline" size="sm"
                className="h-6 px-2 text-[9px]"
                disabled={s.rerollsRestantes <= 0 || !!pendente}
                onClick={() => { s.usarReroll(); toast.info(`Reroll usado. Restam ${s.rerollsRestantes - 1}.`); }}
              >
                <Dices className="size-2.5 mr-1" /> Reroll
              </Button>
            )}
          </div>

          {!s.selecaoAtual && !pendente && (
            <div className="rounded-lg border-2 border-dashed border-primary/40 p-4 text-center space-y-2">
              <Shuffle className="mx-auto size-6 text-primary" />
              <p className="text-[10px] text-muted-foreground">
                Faltam <span className="font-bold text-foreground">{11 - s.escalacao.length}</span> jogadores.
              </p>
              <Button
                onClick={sortearAnim}
                disabled={!!sorteando}
                className="h-8 w-full font-display uppercase italic tracking-widest font-black text-[10px]"
              >
                <Shuffle className={cn("size-3 mr-1.5", sorteando && "animate-spin")} />
                {sorteando ? `Sorteando... ${sorteando}` : "Sortear seleção"}
              </Button>
              {s.escalacao.length === 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    s.sortearAleatorio();
                    toast.success("11 jogadores sorteados aleatoriamente!");
                  }}
                  className="h-8 w-full font-display uppercase italic tracking-widest font-black text-[10px]"
                >
                  <Zap className="size-3 mr-1.5" /> Sortear 11 aleatórios
                </Button>
              )}
            </div>
          )}

          {s.selecaoAtual && (
            <div className="space-y-2 animate-enter">
              <div className="flex items-center gap-1.5 px-1">
                <FlagEmoji emoji={s.selecaoAtual.bandeira} size={14} />
                <h3 className="font-display text-[11px] italic uppercase tracking-tight truncate">
                  {s.selecaoAtual.nome} {s.selecaoAtual.ano}
                </h3>
              </div>
              <ul className="space-y-1 max-h-[360px] overflow-y-auto pr-0.5">
                {s.selecaoAtual.jogadores.map(j => {
                  const jaEscalado = s.nomesJaEscolhidos.includes(j.nome);
                  const compativel = !jaEscalado && posicoesCompativeis(j.posicao).some(p => posicoesLivres.has(p));
                  const ehPendente = pendente?.nome === j.nome;
                  const cor = false ? "border-muted-foreground/40" : RARIDADE_BORDER_CLASS[j.raridade];
                  const textoCor = false ? "text-muted-foreground" : RARIDADE_TEXT_CLASS[j.raridade];
                  return (
                    <li key={j.numero + j.nome} className="relative">
                      <button
                        onClick={() => {
                          if (jaEscalado) { toast.error(`${j.nome} já está escalado.`); return; }
                          if (!compativel) { toast.error(`Sem slot para ${j.posicao}`); return; }
                          if (ehPendente) { s.cancelarPendente(); return; }
                          s.escolherJogador(j);
                        }}
                        disabled={!compativel && !jaEscalado}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded border-l-2 bg-card py-1 pl-2 pr-1.5 text-left transition-all",
                          cor,
                          compativel && !jaEscalado && "hover:bg-secondary/60 active:scale-[0.98]",
                          ehPendente && "ring-1 ring-primary bg-primary/5",
                          (!compativel || jaEscalado) && "opacity-45",
                        )}
                      >
                        <span className="text-[9px] font-bold text-muted-foreground w-5 text-center shrink-0">#{j.numero}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[10px] leading-tight truncate">{j.nome}</div>
                          <div className={cn("text-[8px] font-bold uppercase tracking-widest", textoCor)}>
                            {j.posicao}{!false && ` · ${RARIDADE_LABEL[j.raridade]}`}
                          </div>
                        </div>
                        {!false && (
                          <span className="font-display text-sm font-black shrink-0">{j.forca}</span>
                        )}
                      </button>
                      {jaEscalado && (
                        <div className="absolute inset-0 flex items-center justify-center gap-1 rounded text-[9px] font-bold uppercase tracking-widest text-muted-foreground bg-card/80">
                          <Lock className="size-2.5" /> Escalado
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="text-center text-[8px] text-muted-foreground uppercase tracking-widest pt-1">
                Slots livres: <span className="text-primary font-bold">{[...posicoesLivres].join(" · ")}</span>
              </div>
            </div>
          )}

          {pendente && !s.selecaoAtual && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-2 text-[10px]">
              <span>Pendente: <span className="font-bold">{pendente.nome}</span> <span className="text-primary">({pendente.posicao})</span></span>
              <button className="text-destructive underline ml-2 text-[9px]" onClick={() => s.cancelarPendente()}>cancelar</button>
            </div>
          )}
        </div>

        {/* COL 2: CAMPO — centro grande */}
        <div className="flex flex-col items-center">
          <div className="rounded-xl border border-border bg-card p-2 w-full max-w-[420px]">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Seu time</span>
              <span className="text-[9px] uppercase tracking-widest text-primary">{formacao.nome}</span>
            </div>
            <MiniCampo
              formacao={formacao}
              escalacao={s.escalacao}
              posicaoAlvo={pendente?.posicao}
              esconderRaridade={false}
              onSlotClick={pendente ? (slotId) => {
                const ok = s.posicionarEm(slotId);
                if (ok) toast.success(`${pendente.nome} escalado!`);
              } : undefined}
              onJogadorClick={!pendente ? (slotId) => setSlotParaExcluir(slotId) : undefined}
            />
            <p className="mt-1.5 text-center text-[8px] text-muted-foreground uppercase tracking-widest">
              Toque para trocar
            </p>
          </div>
        </div>

        {/* COL 3: Escalação atual */}
        <div className="rounded-xl border border-border bg-card p-2.5">
          <h2 className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Escalação atual</h2>
          <ul className="space-y-1">
            {slotsOrdenados.map(slot => {
              const j = ocupados.get(slot.id);
              return (
                <li
                  key={slot.id}
                  onClick={j ? () => setSlotParaExcluir(slot.id) : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded border-l-2 px-2 py-1 text-[10px] transition-all",
                    j
                      ? (false ? "border-muted-foreground/40 bg-secondary/60" : `${RARIDADE_BORDER_CLASS[j.raridade]} bg-secondary/60`) + " cursor-pointer hover:opacity-80"
                      : "border-border/40 border-dashed text-muted-foreground",
                  )}
                >
                  <span className="w-7 shrink-0 text-[9px] font-bold uppercase tracking-widest text-primary">{slot.label}</span>
                  {j ? (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate text-[10px] leading-tight">{j.nome}</div>
                        {!false && (
                          <div className={cn("text-[8px] font-bold uppercase tracking-widest", RARIDADE_TEXT_CLASS[j.raridade])}>
                            {RARIDADE_LABEL[j.raridade]}
                          </div>
                        )}
                      </div>
                      {!false && <span className="font-display text-xs font-black shrink-0">{j.forca}</span>}
                      <Trash2 className="size-3 text-muted-foreground shrink-0" />
                    </>
                  ) : (
                    <span className="flex-1 italic text-[9px]">vazio</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* MODAL de confirmação de exclusão */}
      {jogadorParaExcluir && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setSlotParaExcluir(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 animate-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg uppercase italic tracking-tight">Trocar jogador?</h3>
              <button onClick={() => setSlotParaExcluir(null)}>
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-1">
              Remover <span className="font-bold text-foreground">{jogadorParaExcluir.nome}</span> ({jogadorParaExcluir.posicao}) e escolher outro?
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Trocas restantes: <span className="font-bold text-primary">{s.trocasRestantes}</span> de {limiteTrocas}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSlotParaExcluir(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={s.trocasRestantes <= 0}
                onClick={confirmarExclusao}
              >
                <Trash2 className="size-4 mr-1.5" /> Remover
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-0.5 text-[8px] uppercase tracking-widest text-muted-foreground">
        {icon}{label}
      </div>
      <div className="font-display text-sm font-black leading-none">{value || "—"}</div>
    </div>
  );
}
