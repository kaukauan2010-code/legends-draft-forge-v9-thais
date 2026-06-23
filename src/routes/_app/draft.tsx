// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useCampanha } from "@/lib/campanha";
import { FORMACOES } from "@/lib/formacoes";
import { MiniCampo } from "@/components/MiniCampo";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Dices, Shuffle, Shield, Sword, Star, Trash2, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { statsEscalacao } from "@/lib/simulador";
import { RARIDADE_CSS, posicoesCompativeis } from "@/lib/selecoes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/draft")({
  head: () => ({ meta: [{ title: "Draft — World Cup Draft" }] }),
  component: Draft,
});

function Draft() {
  const navigate = useNavigate();
  const s = useCampanha();
  const [tempo, setTempo] = useState(30);
  const [slotParaExcluir, setSlotParaExcluir] = useState<string | null>(null);

  useEffect(() => {
    if (!s.ativa || !s.config) {
      navigate({ to: "/jogar", replace: true });
    }
  }, [s.ativa, s.config, navigate]);

  // reset timer ao mudar contexto
  useEffect(() => {
    setTempo(30);
  }, [s.selecaoAtual?.id, s.escalacao.length, s.jogadorPendente?.nome]);

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

  // fim do draft → torneio
  useEffect(() => {
    if (s.ativa && s.escalacao.length === 11) {
      s.comecarTorneio();
      navigate({ to: "/torneio" });
    }
  }, [s.escalacao.length, s.ativa, navigate, s]);

  if (!s.config) return null;

  const formacao = FORMACOES[s.config.formacaoId];
  const esconderForca = s.config.modo === "almanaque";
  const esconderRaridade = s.config.modo === "almanaque";
  const posicoesLivres = new Set(s.slotsRestantes.map(sl => sl.posicao));
  const pendente = s.jogadorPendente;
  const stats = statsEscalacao(s.escalacao);
  const limiteTrocas = s.config.modo === "classico" ? 3 : 1;
  const limiteRerolls = s.config.modo === "classico" ? 3 : 1;

  // Lista de slots (ordenada da defesa pro ataque) para mostrar embaixo
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
    <div className="mx-auto max-w-5xl px-4 py-4 space-y-4">
      {/* HEADER timer + stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-destructive">Janela de Draft</div>
          <div className="text-xs text-muted-foreground">
            Slot {s.escalacao.length}/11 ·{" "}
            {pendente
              ? <>Clique no campo no slot <span className="font-bold text-primary">{pendente.posicao}</span></>
              : s.selecaoAtual
                ? <>Escolha um jogador da seleção</>
                : <>Aperte <span className="font-bold text-primary">SORTEAR</span> para a próxima seleção</>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StatBadge icon={<Star className="size-3" />} label="Força" value={stats.forca} />
          <StatBadge icon={<Sword className="size-3" />} label="Ataque" value={stats.ataque} />
          <StatBadge icon={<Shield className="size-3" />} label="Defesa" value={stats.defesa} />
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
              <Dices className="size-3" />Rerolls
            </div>
            <div className="font-display text-lg font-black leading-none">{s.rerollsRestantes}/{limiteRerolls}</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
              <Trash2 className="size-3" />Trocas
            </div>
            <div className="font-display text-lg font-black leading-none">{s.trocasRestantes}/{limiteTrocas}</div>
          </div>
          {(s.selecaoAtual || pendente) && (
            <div className="flex flex-col items-end gap-1 min-w-[88px]">
              <div className={cn(
                "font-display text-3xl font-black tabular-nums leading-none",
                tempo <= 10 ? "text-destructive animate-pulse" : "text-foreground",
              )}>
                00:{tempo.toString().padStart(2, "0")}
              </div>
              {/* barra de tempo regressiva */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full transition-all duration-1000 ease-linear",
                    tempo <= 10 ? "bg-destructive" : "bg-primary",
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, (tempo / 30) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GRID: lista de seleção (esquerda) + campo (direita) */}
      <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* LISTA DE SELEÇÃO — jogadores disponíveis para escolher */}
        <aside className="rounded-2xl border border-border bg-card p-3 order-2 md:order-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
              {s.selecaoAtual ? "Escolha um jogador" : "Aguardando sorteio"}
            </h2>
            {s.selecaoAtual && (
              <Button
                variant="outline" size="sm"
                disabled={s.rerollsRestantes <= 0 || !!pendente}
                onClick={() => { s.usarReroll(); toast.info(`Reroll usado. Restam ${s.rerollsRestantes - 1}.`); }}
              >
                <Dices className="size-3.5 mr-1" /> {s.rerollsRestantes}
              </Button>
            )}
          </div>

          {!s.selecaoAtual && !pendente && (
            <div className="rounded-xl border-2 border-dashed border-primary/40 p-5 text-center">
              <Shuffle className="mx-auto size-8 text-primary mb-2" />
              <p className="text-xs text-muted-foreground mb-3">
                Faltam <span className="font-bold text-foreground">{11 - s.escalacao.length}</span> jogadores.
              </p>
              <Button
                onClick={() => s.sortearProxima()}
                className="h-10 w-full font-display uppercase italic tracking-widest font-black"
              >
                <Shuffle className="size-4 mr-2" /> Sortear seleção
              </Button>
            </div>
          )}

          {s.selecaoAtual && (
            <div className="space-y-3 animate-enter">
              <h3 className="font-display text-sm italic uppercase tracking-tight text-center">
                {s.selecaoAtual.bandeira} {s.selecaoAtual.nome} {s.selecaoAtual.ano}
              </h3>
              <ul className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
                {s.selecaoAtual.jogadores.map(j => {
                  const jaEscalado = s.nomesJaEscolhidos.includes(j.nome);
                  const compativel = !jaEscalado && posicoesCompativeis(j.posicao).some(p => posicoesLivres.has(p));
                  const ehPendente = pendente?.nome === j.nome;
                  return (
                    <li key={j.numero + j.nome} className="relative">
                      <PlayerCard
                        jogador={j}
                        esconderForca={esconderForca}
                        esconderRaridade={esconderRaridade}
                        disabled={!compativel}
                        selecionado={ehPendente}
                        variant="list"
                        onClick={() => {
                          if (jaEscalado) {
                            toast.error(`${j.nome} já está escalado no seu time.`);
                            return;
                          }
                          if (!compativel) {
                            toast.error(`Não há slot livre para ${j.posicao}`);
                            return;
                          }
                          if (ehPendente) {
                            // Clicar de novo no jogador já selecionado cancela a escolha.
                            s.cancelarPendente();
                            return;
                          }
                          // Troca direto para o jogador clicado, mesmo com outro pendente.
                          s.escolherJogador(j);
                        }}
                      />
                      {jaEscalado && (
                        <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-card/85 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          <Lock className="size-3.5" /> Já escalado
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="text-center text-[9px] text-muted-foreground uppercase tracking-widest">
                Livres: <span className="text-primary font-bold">{[...posicoesLivres].join(" · ")}</span>
              </div>
            </div>
          )}

          {pendente && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs">
              <button
                className="text-left hover:underline"
                onClick={() => s.cancelarPendente()}
                title="Clique para cancelar a seleção"
              >
                Pendente: <span className="font-bold text-foreground">{pendente.nome}</span>{" "}
                <span className="text-primary">({pendente.posicao})</span>
              </button>
              <button className="text-destructive underline shrink-0 ml-2" onClick={() => s.cancelarPendente()}>
                cancelar
              </button>
            </div>
          )}
        </aside>

        {/* CAMPO */}
        <div className="rounded-2xl border border-border bg-card p-3 order-1 md:order-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground">Seu time</h2>
            <span className="text-[10px] uppercase tracking-widest text-primary">{formacao.nome}</span>
          </div>
          <MiniCampo
            formacao={formacao}
            escalacao={s.escalacao}
            posicaoAlvo={pendente?.posicao}
            esconderRaridade={esconderRaridade}
            onSlotClick={pendente ? (slotId) => {
              const ok = s.posicionarEm(slotId);
              if (ok) toast.success(`${pendente.nome} escalado!`);
            } : undefined}
            onJogadorClick={!pendente ? (slotId) => setSlotParaExcluir(slotId) : undefined}
          />
          <p className="mt-2 text-center text-[9px] text-muted-foreground uppercase tracking-widest">
            Toque em um jogador escalado para trocar
          </p>
        </div>
      </div>

      {/* LISTAGEM DOS JOGADORES JÁ ESCALADOS — abaixo */}
      <section className="rounded-2xl border border-border bg-card p-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Escalação atual</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {slotsOrdenados.map(slot => {
            const j = ocupados.get(slot.id);
            return (
              <li
                key={slot.id}
                onClick={j ? () => setSlotParaExcluir(slot.id) : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs",
                  j
                    ? (esconderRaridade ? "border-muted-foreground/40" : `border-rarity-${RARIDADE_CSS[j.raridade]}`) + " bg-secondary cursor-pointer hover:opacity-80"
                    : "border-dashed border-border/50 text-muted-foreground",
                )}
              >
                <span className="w-10 shrink-0 text-[10px] font-bold uppercase tracking-widest text-primary">
                  {slot.label}
                </span>
                {j ? (
                  <>
                    <span className="flex-1 truncate font-bold">{j.nome}</span>
                    {!esconderRaridade && (
                      <span className={cn("text-[8px] font-bold uppercase tracking-widest", `rarity-${RARIDADE_CSS[j.raridade]}`)}>
                        {j.raridade}
                      </span>
                    )}
                    {!esconderForca && (
                      <span className="font-display text-sm font-black">{j.forca}</span>
                    )}
                    <Trash2 className="size-3.5 text-muted-foreground shrink-0" />
                  </>
                ) : (
                  <span className="flex-1 italic">vazio</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

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
              Remover <span className="font-bold text-foreground">{jogadorParaExcluir.nome}</span> ({jogadorParaExcluir.posicao}) e escolher outro jogador para esse slot?
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Trocas restantes: <span className="font-bold text-primary">{s.trocasRestantes}</span> de {limiteTrocas} · O reroll não é afetado.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSlotParaExcluir(null)}>
                Cancelar
              </Button>
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

function StatBadge({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
        {icon}{label}
      </div>
      <div className="font-display text-lg font-black leading-none">{value || "—"}</div>
    </div>
  );
}
