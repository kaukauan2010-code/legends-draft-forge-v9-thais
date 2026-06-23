// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCampanha } from "@/lib/campanha";
import type { EstadoCampanha } from "@/lib/campanha";
import { useConquistas } from "@/lib/useConquistas";
import { Button } from "@/components/ui/button";
import { Play, FastForward, Zap, Trophy, Skull, ChevronDown, Target, RotateCcw, Users, Network } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { EventoJogo, Time, CobrancaPenalti } from "@/lib/simulador";
import { statsTime } from "@/lib/simulador";
import { RARIDADE_CSS, RARIDADE_TEXT_CLASS, RARIDADE_BORDER_CLASS, RARIDADE_LABEL } from "@/lib/selecoes";
import { CampoAoVivo } from "@/components/CampoAoVivo";
import { ChaveamentoVisual } from "@/components/ChaveamentoVisual";
import { toast } from "sonner";

type Velocidade = "normal" | "rapida" | "ultra";
const DUR_REAL_MS: Record<Velocidade, number> = { normal: 40000, rapida: 20000, ultra: 5000 };
const TEMPO_AUTO_PROXIMA_MS = 3000; // pausa entre partidas no modo automático

export const Route = createFileRoute("/_app/torneio")({
  head: () => ({ meta: [{ title: "Torneio — World Cup Draft" }] }),
  component: Torneio,
});
function Torneio() {
  const navigate = useNavigate();
  const s = useCampanha();
  const meu = s.meuTime();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { registrarPartida } = useConquistas();
  const [velocidade, setVelocidade] = useState<Velocidade>("rapida");
  const [partidaAtiva, setPartidaAtiva] = useState<{ minuto: number; eventos: EventoJogo[]; placar: string } | null>(null);
  const [adversarioAtivo, setAdversarioAtivo] = useState<Time | null>(null);
  const [faseAtiva, setFaseAtiva] = useState<string | null>(null);
  const [penaltisAoVivo, setPenaltisAoVivo] = useState<{ casa: Time; fora: Time; cobrancas: CobrancaPenalti[]; indiceAtual: number } | null>(null);
  // Card pós-partida mostrando os 11 dos dois times lado a lado. Permanece visível
  // até o jogador apertar "continuar" (ou auto-avança em modo automático).
  const [resumoPosJogo, setResumoPosJogo] = useState<{ meu: Time; adv: Time; placar: string; faseLabel: string; minhaVitoria: boolean; empate: boolean } | null>(null);
  // Guarda o último adversário enfrentado para mostrar no card de eliminado/campeão.
  const [ultimoAdversario, setUltimoAdversario] = useState<Time | null>(null);
  // Segundos restantes até a próxima partida começar sozinha no modo automático
  // (mostrado como barra de progresso + legenda no lobby).
  const [contagemAuto, setContagemAuto] = useState<number | null>(null);
  // Fluxo do mata-mata: primeiro mostramos o card da partida (preview com os
  // dois times), depois o chaveamento, depois a partida. `etapaMata` controla
  // qual tela está visível enquanto `s.mostrarChaveamento` estiver setado.
  const [etapaMata, setEtapaMata] = useState<"preview" | "chave">("preview");
  useEffect(() => {
    if (s.mostrarChaveamento) setEtapaMata("preview");
  }, [s.mostrarChaveamento]);
  const [salvou, setSalvou] = useState(false);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimeoutRef = useRef<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null>(null);


  useEffect(() => {
    if (!s.ativa || !meu) navigate({ to: "/jogar", replace: true });
  }, [s.ativa, meu, navigate]);

  const salvarPartida = useMutation({
    mutationFn: async () => {
      if (!user || !s.config) return;
      const { error } = await supabase.from("partidas").insert({
        user_id: user.id,
        modo: s.config.modo,
        formacao: s.config.formacaoId,
        estrategia: s.config.estrategia,
        fase_alcancada: s.fase,
        pontuacao: 0,
        campeao: s.fase === "campeao",
        elenco: s.escalacao as any,
        log: s.historicoJogos as any,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stats"] }); qc.invalidateQueries({ queryKey: ["historico"] }); },
  });

  // salvar campanha quando termina
  useEffect(() => {
    if ((s.fase === "campeao" || s.fase === "eliminado") && !salvou && user) {
      setSalvou(true);
      salvarPartida.mutate();
    }
  }, [s.fase, salvou, user, salvarPartida]);

  // Inicia a contagem regressiva visível antes da próxima partida automática.
  // Substitui o antigo setTimeout silencioso por um setInterval que atualiza
  // contagemAuto a cada segundo, permitindo mostrar a barra de progresso.
  const iniciarContagemAuto = () => {
    let restante = TEMPO_AUTO_PROXIMA_MS / 1000;
    setContagemAuto(restante);
    const tick = setInterval(() => {
      restante -= 1;
      if (restante <= 0) {
        clearInterval(tick);
        setContagemAuto(null);
        jogarPartida();
        return;
      }
      setContagemAuto(restante);
    }, 1000);
    autoTimeoutRef.current = tick;
  };

  // Simular uma partida com animação minuto-a-minuto
  const jogarPartida = () => {
    // Guarda de idempotência: se já existe uma partida tocando, pênaltis em
    // andamento, ou resumo aberto, NÃO inicia outra. Sem isso, um duplo clique
    // ou um auto-tick disparando logo após uma transição pode pular a animação
    // e levar direto pro card de eliminado/campeão.
    if (partidaAtiva || penaltisAoVivo || resumoPosJogo) return;
    const adv = s.adversarioAtual();
    const faseDaPartida = s.fase;
    // Captura o confronto ANTES de simular: simularProximaPartida() pode sobrescrever
    // proximoConfronto com o confronto da fase seguinte quando há vitória.
    const confrontoAntes = s.proximoConfronto;
    const res = s.simularProximaPartida();
    if (!res) return;
    setAdversarioAtivo(adv);
    setFaseAtiva(faseDaPartida);
    const eventosOrdenados = [...res.eventos].sort((a, b) => a.minuto - b.minuto);
    const dur = DUR_REAL_MS[velocidade];
    const ms = dur / 90;
    let minuto = 0;
    let golsCasa = 0, golsFora = 0;
    const eventosMostrados: EventoJogo[] = [];
    setPartidaAtiva({ minuto: 0, eventos: [], placar: "0 x 0" });

    if (intervaloRef.current) clearInterval(intervaloRef.current);
    intervaloRef.current = setInterval(() => {
      minuto++;
      const novos = eventosOrdenados.filter(e => e.minuto === minuto);
      novos.forEach(e => {
        if (e.tipo === "gol") {
          if (e.time === "casa") golsCasa++; else if (e.time === "fora") golsFora++;
        }
        eventosMostrados.push(e);
      });
      setPartidaAtiva({ minuto, eventos: [...eventosMostrados], placar: `${golsCasa} x ${golsFora}` });
      if (minuto >= 90) {
        clearInterval(intervaloRef.current!);
        const estadoPos = useCampanha.getState();
        const ultimoJogo = estadoPos.historicoJogos[estadoPos.historicoJogos.length - 1];
        const campanhaEncerrada = estadoPos.fase === "campeao" || estadoPos.fase === "eliminado";
        const lendariosNaEscalacao = estadoPos.escalacao.filter(j => j.raridade === "lendario").length;
        const improvisadosNaEscalacao = estadoPos.escalacao.filter(j => j.improvisado).length;
        if (user && ultimoJogo) {
          const empateReal = res.golsCasa === res.golsFora && !ultimoJogo.penaltis;
          const vitoriaReal = !empateReal && ultimoJogo.minhaVitoria;
          registrarPartida({
            vitoria: vitoriaReal,
            empate: empateReal,
            golsMeu: res.golsCasa,
            golsAdv: res.golsFora,
            formacaoId: estadoPos.config?.formacaoId ?? "",
            selecoesUsadas: estadoPos.selecoesUsadas,
            jogadoresLendariosEscalados: lendariosNaEscalacao,
            improvisados: improvisadosNaEscalacao,
            foiPenaltis: !!ultimoJogo.penaltis,
            venceuPenaltis: ultimoJogo.penaltis ? ultimoJogo.minhaVitoria : undefined,
            campanhaEncerrada,
            campeao: estadoPos.fase === "campeao",
            modo: estadoPos.config?.modo,
            trocasUsadasNestaCompanha: campanhaEncerrada
              ? (estadoPos.config?.modo === "classico" ? 3 : 1) - estadoPos.trocasRestantes
              : undefined,
            rerollsUsadosNestaCompanha: undefined,
          }).then(novas => {
            novas.forEach(c => toast.success(`🏆 Conquista desbloqueada: ${c.nome}`, { duration: 4000 }));
          });
        }
        // Se a partida foi para pênaltis, reproduz a disputa cobrança a cobrança
        // antes de fechar a tela de partida ao vivo. O jogador pode ser "casa" ou
        // "fora" dependendo de como o confronto foi montado no chaveamento.
        // Usa o confronto capturado ANTES da simulação, pois proximoConfronto pode
        // já ter sido sobrescrito pelo confronto da fase seguinte.
        if (ultimoJogo?.penaltis) {
          // Após o fix de normalização em campanha.ts, meu time é SEMPRE
          // o `casa` na simulação/penaltis. Usa diretamente `meu`/`adv` em
          // vez do confronto pré-normalizado para evitar inversão.
          const casaTime = meu;
          const foraTime = adv ?? meu;
          if (!casaTime || !foraTime) return;
          setTimeout(() => {
            // CRÍTICO: limpa partidaAtiva ANTES de mostrar pênaltis. Sem isso,
            // o render fica preso na tela de partida ao vivo e a disputa nunca aparece.
            setPartidaAtiva(null);
            setPenaltisAoVivo({ casa: casaTime!, fora: foraTime!, cobrancas: ultimoJogo.penaltis!.cobrancas, indiceAtual: 0 });
          }, 1200);
          return;
        }
        // Mostra o card de resumo com os DOIS times lado a lado antes de seguir.
        // Em modo automático, o card fica por alguns segundos e a próxima partida
        // começa sozinha; no manual, o jogador aperta "continuar".
        setTimeout(() => {
          const meuFimDeJogo = useCampanha.getState().meuTime();
          if (meuFimDeJogo && adv) {
            const faseLabel = (faseDaPartida ?? "").toUpperCase();
            const empateReal = res.golsCasa === res.golsFora;
            setResumoPosJogo({
              meu: meuFimDeJogo,
              adv,
              placar: `${res.golsCasa} x ${res.golsFora}`,
              faseLabel,
              minhaVitoria: !empateReal && (ultimoJogo?.minhaVitoria ?? false),
              empate: empateReal,
            });
            // Persiste o adversário para exibi-lo no card final de eliminado/campeão.
            setUltimoAdversario(adv);
          }
          setPartidaAtiva(null);
          const estado = useCampanha.getState();
          if (estado.modoAutomatico && estado.fase !== "campeao" && estado.fase !== "eliminado") {
            // Em automático, fecha o resumo sozinho depois e arranca a próxima.
            if (estado.mostrarApresentacaoGrupos || estado.mostrarChaveamento) return;
            setTimeout(() => { setResumoPosJogo(null); iniciarContagemAuto(); }, 3500);
          }
        }, 1500);
      }
    }, ms);
  };


  // Avança a reprodução visual dos pênaltis, cobrança por cobrança. Ao terminar,
  // fecha a tela de partida ao vivo e segue o fluxo normal (auto ou manual).
  useEffect(() => {
    if (!penaltisAoVivo) return;
    const total = penaltisAoVivo.cobrancas.length;
    if (penaltisAoVivo.indiceAtual >= total) {
      const t = setTimeout(() => {
        setPenaltisAoVivo(null);
        setPartidaAtiva(null);
        const estado = useCampanha.getState();
        if (estado.modoAutomatico && estado.fase !== "campeao" && estado.fase !== "eliminado") {
          if (estado.mostrarApresentacaoGrupos || estado.mostrarChaveamento) return;
          iniciarContagemAuto();
        }
      }, 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setPenaltisAoVivo(p => p ? { ...p, indiceAtual: p.indiceAtual + 1 } : p);
    }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penaltisAoVivo?.indiceAtual, penaltisAoVivo === null]);

  useEffect(() => () => {
    if (intervaloRef.current) clearInterval(intervaloRef.current);
    if (autoTimeoutRef.current) clearTimeout(autoTimeoutRef.current);
  }, []);

  // Quando o modo automático está ligado e uma tela de apresentação/chaveamento é
  // confirmada, retoma o ciclo automaticamente.
  const avancarAutomatico = () => {
    if (s.modoAutomatico) {
      autoTimeoutRef.current = setTimeout(() => jogarPartida(), 600);
    }
  };

  if (!meu || !s.config) return null;

  // === ORDEM DE RENDER ===
  // Telas "ao vivo" (partida em curso, pênaltis, resumo pós-jogo) têm PRIORIDADE
  // sobre as telas de transição (apresentação de grupos, chaveamento, eliminado,
  // campeão). Caso contrário, quando `simularProximaPartida()` avança o estado
  // do torneio durante uma jogada (ex: vencer oitavas seta `mostrarChaveamento`
  // = "quartas" no mesmo tick em que a partida começa), a tela de chaveamento
  // tomaria conta da renderização e a animação da partida nunca apareceria,
  // dando a sensação de "pulou direto pra próxima fase / pro eliminado".

  // --- PARTIDA AO VIVO (PRIORIDADE 1) ---
  if (partidaAtiva) {
    const placar = partidaAtiva.placar.split(" x ");
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-2">{(faseAtiva ?? s.fase).toUpperCase()}</div>
          <div className="flex items-center justify-around">
            <div className="text-center flex-1">
              <div className="text-2xl mb-1">🏆</div>
              <div className="font-display text-xs uppercase truncate">{meu.nome}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                <span className="size-2 rounded-full bg-blue-500" /> Azul
              </div>
            </div>
            <div className="font-display text-5xl font-black tabular-nums">{placar[0]}–{placar[1]}</div>
            <div className="text-center flex-1">
              <div className="text-2xl mb-1">{adversarioAtivo?.bandeira ?? "🤖"}</div>
              <div className="font-display text-xs uppercase truncate">{adversarioAtivo?.nome ?? "Adversário"}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                <span className="size-2 rounded-full bg-red-500" /> Vermelho
              </div>
            </div>
          </div>
          <div className="mt-3 text-center text-primary font-mono text-sm">{partidaAtiva.minuto}'</div>
          <div className="mt-2 h-1 rounded bg-border overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(partidaAtiva.minuto / 90) * 100}%` }} />
          </div>
        </div>

        {adversarioAtivo && (
          <CampoAoVivo
            casa={meu}
            fora={adversarioAtivo}
            eventoAtual={partidaAtiva.eventos[partidaAtiva.eventos.length - 1] ?? null}
            velocidade={velocidade}
          />
        )}

        <div className="rounded-2xl border border-border bg-card p-3 h-72 overflow-y-auto flex flex-col-reverse">
          <div className="space-y-1.5">
            {partidaAtiva.eventos.map((e, i) => (
              <div key={i} className={cn(
                "text-xs leading-snug animate-enter",
                e.tipo === "gol" && "font-bold text-primary",
                e.tipo === "cartao" && "text-yellow-500",
                e.tipo === "info" && "text-muted-foreground italic",
              )}>
                {e.texto}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- APRESENTAÇÃO DOS GRUPOS (antes da fase de grupos começar) ---
  if (s.mostrarApresentacaoGrupos) {
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-28 animate-enter">
        <header className="text-center">
          <Users className="mx-auto size-10 text-primary mb-2" />
          <h1 className="font-display text-3xl uppercase italic tracking-tight">Fase de Grupos</h1>
          <p className="text-sm text-muted-foreground mt-1">32 times · 8 grupos · top 2 de cada avança às oitavas</p>
        </header>

        <div className="space-y-3">
          {s.grupos.map((g, gi) => (
            <div key={g.nome} className={cn(
              "rounded-xl border bg-card p-3",
              gi === s.meuGrupoIndex ? "border-primary" : "border-border",
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-display uppercase tracking-tight font-bold text-sm">Grupo {g.nome}</span>
                {gi === s.meuGrupoIndex && (
                  <span className="text-[9px] uppercase tracking-widest text-primary font-bold">Seu grupo</span>
                )}
              </div>
              <ul className="space-y-1">
                {g.times.map((t, i) => (
                  <li key={i} className={cn(
                    "flex items-center gap-2 text-xs rounded px-2 py-1",
                    !t.time.isCPU && "bg-primary/10 font-bold",
                  )}>
                    <span>{t.time.bandeira}</span>
                    <span className="truncate flex-1">{t.time.nome}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Button
          onClick={() => {
            s.confirmarApresentacaoGrupos();
            avancarAutomatico();
          }}
          className="w-full h-12 font-display uppercase tracking-widest font-black"
        >
          Começar fase de grupos
        </Button>
      </div>
    );
  }

  // --- TELA: MATA-MATA (preview da partida → chaveamento → iniciar) ---
  // Sequência: ao entrar em oitavas/quartas/semi/final, primeiro mostramos
  // um card da próxima partida (meu time vs adversário). Depois do "Continuar",
  // o jogador vê o chaveamento completo. Por fim, "Iniciar partida" arranca.
  if (s.mostrarChaveamento && meu) {
    const faseChave = s.mostrarChaveamento as "oitavas" | "quartas" | "semi" | "final";
    const conf = s.proximoConfronto;
    const advNoConfronto: Time | null =
      conf && (conf.casa?.isCPU ? (conf.casa as Time) : conf.fora?.isCPU ? (conf.fora as Time) : null);

    if (etapaMata === "preview") {
      return (
        <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-28 animate-enter">
          <header className="text-center">
            <Trophy className="mx-auto size-10 text-primary mb-2" />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Próxima partida</div>
            <h1 className="font-display text-3xl uppercase italic tracking-tight">{tituloFase(faseChave)}</h1>
          </header>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <TimeBlock time={meu} />
              <div className="font-display text-2xl italic text-muted-foreground">VS</div>
              {advNoConfronto ? (
                <TimeBlock time={advNoConfronto} />
              ) : (
                <div className="text-center min-w-0">
                  <div className="text-3xl">❔</div>
                  <div className="font-bold text-sm mt-1 truncate">A definir</div>
                </div>
              )}
            </div>
          </section>

          <Button
            onClick={() => setEtapaMata("chave")}
            className="w-full h-12 font-display uppercase tracking-widest font-black"
          >
            <Network className="size-4 mr-1.5" /> Ver chaveamento
          </Button>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-28 animate-enter">
        <header className="text-center">
          <Network className="mx-auto size-10 text-primary mb-2" />
          <h1 className="font-display text-3xl uppercase italic tracking-tight">{tituloFase(faseChave)}</h1>
          <p className="text-sm text-muted-foreground mt-1">Confira o chaveamento até a final</p>
        </header>

        <ChaveamentoVisual chave={s.chave} faseAtual={faseChave} />

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => setEtapaMata("preview")}
            className="h-12 font-display uppercase tracking-widest font-bold"
          >
            Voltar
          </Button>
          <Button
            onClick={() => {
              s.confirmarChaveamento();
              // Inicia a próxima partida imediatamente (sem passar pela tela do lobby).
              setTimeout(() => jogarPartida(), 0);
            }}
            className="h-12 font-display uppercase tracking-widest font-black"
          >
            <Play className="size-4 mr-1.5" /> Iniciar partida
          </Button>
        </div>
      </div>
    );
  }

  // --- DISPUTA DE PÊNALTIS AO VIVO ---
  if (penaltisAoVivo) {
    const { casa, fora, cobrancas, indiceAtual } = penaltisAoVivo;
    const cobrancasFeitas = cobrancas.slice(0, indiceAtual);
    const cobrancaAtual = cobrancas[indiceAtual] ?? null;
    const placarCasa = cobrancasFeitas.filter(c => c.time === "casa" && c.acertou).length;
    const placarFora = cobrancasFeitas.filter(c => c.time === "fora" && c.acertou).length;
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-destructive text-center mb-2">Disputa de Pênaltis</div>
          <div className="flex items-center justify-around">
            <div className="text-center flex-1">
              <div className="text-2xl mb-1">{casa.isCPU ? casa.bandeira : "🏆"}</div>
              <div className="font-display text-xs uppercase truncate">{casa.nome}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                <span className="size-2 rounded-full bg-blue-500" /> Azul
              </div>
            </div>
            <div className="font-display text-5xl font-black tabular-nums">{placarCasa}–{placarFora}</div>
            <div className="text-center flex-1">
              <div className="text-2xl mb-1">{fora.isCPU ? fora.bandeira : "🏆"}</div>
              <div className="font-display text-xs uppercase truncate">{fora.nome}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                <span className="size-2 rounded-full bg-red-500" /> Vermelho
              </div>
            </div>
          </div>
          {cobrancaAtual && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{cobrancaAtual.jogador}</span> bate pelo time {cobrancaAtual.time === "casa" ? casa.nome : fora.nome}...
            </p>
          )}
        </div>

        <CampoAoVivo casa={casa} fora={fora} eventoAtual={null} modo="penaltis" cobrancaAtual={cobrancaAtual} velocidade={velocidade} />

        {/* marcadores de cada cobrança já realizada, estilo placar de TV */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex justify-center gap-1">
            {cobrancasFeitas.filter(c => c.time === "casa").map((c, i) => (
              <span key={i} className={cn("size-3 rounded-full", c.acertou ? "bg-primary" : "bg-destructive/60")} />
            ))}
          </div>
          <div className="flex justify-center gap-1">
            {cobrancasFeitas.filter(c => c.time === "fora").map((c, i) => (
              <span key={i} className={cn("size-3 rounded-full", c.acertou ? "bg-primary" : "bg-destructive/60")} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- RESUMO PÓS-PARTIDA (cards dos dois times lado a lado) ---
  if (resumoPosJogo) {
    const { meu: meuRes, adv: advRes, placar, faseLabel, minhaVitoria, empate } = resumoPosJogo;
    const corBorda = empate ? "border-yellow-500/50 bg-yellow-500/5" : minhaVitoria ? "border-primary/60 bg-primary/5" : "border-destructive/40 bg-destructive/5";
    const labelResultado = empate ? "Empate" : minhaVitoria ? "Vitória" : "Derrota";
    const corLabel = empate ? "text-yellow-500" : minhaVitoria ? "text-primary" : "text-destructive";
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-4 animate-enter pb-10">
        <div className={cn("rounded-2xl border-2 p-4 text-center", corBorda)}>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{faseLabel} · Fim de jogo</div>
          <div className="flex items-center justify-around">
            <div className="text-center flex-1">
              <div className="text-3xl mb-1">🏆</div>
              <div className="font-display text-xs uppercase truncate">{meuRes.nome}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                <span className="size-2 rounded-full bg-blue-500" /> Azul
              </div>
            </div>
            <div className="font-display text-4xl font-black tabular-nums">{placar}</div>
            <div className="text-center flex-1">
              <div className="text-3xl mb-1">{advRes.bandeira}</div>
              <div className="font-display text-xs uppercase truncate">{advRes.nome}</div>
              <div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                <span className="size-2 rounded-full bg-red-500" /> Vermelho
              </div>
            </div>
          </div>
          <p className={cn("mt-2 font-display uppercase text-sm font-black tracking-widest", corLabel)}>
            {labelResultado}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TimeEscalacao time={meuRes} titulo="Seu time" />
          <TimeEscalacao time={advRes} titulo="Adversário" />
        </div>

        <Button
          onClick={() => {
            setResumoPosJogo(null);
            if (s.modoAutomatico && s.fase !== "campeao" && s.fase !== "eliminado") iniciarContagemAuto();
          }}
          className="w-full h-12 font-display uppercase tracking-widest font-black"
        >
          Continuar
        </Button>
      </div>
    );
  }

  // --- TELA FIM DE CAMPANHA ---
  // IMPORTANTE: só mostra depois que a partida ao vivo, pênaltis e resumo
  // pós-jogo terminaram — senão o jogador "pula" direto para o card de eliminado
  // sem ver a animação da última partida.
  if ((s.fase === "campeao" || s.fase === "eliminado") && !partidaAtiva && !penaltisAoVivo && !resumoPosJogo) {


    const venceu = s.fase === "campeao";
    const ultimaFase = s.historicoJogos[s.historicoJogos.length - 1]?.fase ?? "";
    return (
      <div className="mx-auto max-w-md px-4 py-6 space-y-6 animate-enter pb-10">
        <div className={cn("rounded-2xl border-2 p-6 text-center", venceu ? "border-legendary bg-legendary/10 glow-legendary" : "border-destructive/40 bg-destructive/5")}>
          {venceu ? <Trophy className="mx-auto size-16 text-legendary mb-3" /> : <Skull className="mx-auto size-16 text-destructive mb-3" />}
          <h1 className="font-display text-4xl uppercase italic font-black tracking-tighter">
            {venceu ? "CAMPEÃO!" : "ELIMINADO"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {venceu ? "Você ergueu a taça do World Cup Draft." : `Eliminado na fase: ${ultimaFase || "Grupos"}`}
          </p>
        </div>

        {/* Elenco final — meu time + último adversário lado a lado */}
        <section>
          <h2 className="font-display uppercase tracking-tight text-lg mb-3">Elenco final</h2>
          {ultimoAdversario ? (
            <div className="grid grid-cols-2 gap-2">
              <TimeEscalacao time={meu!} titulo="Seu time" />
              <TimeEscalacao time={ultimoAdversario} titulo={`vs ${ultimoAdversario.nome}`} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {s.escalacao.map(j => (
                <div key={j.slotId} className={cn(
                  "flex items-center gap-3 rounded-xl border-l-4 bg-card p-3",
                  RARIDADE_BORDER_CLASS[j.raridade],
                )}>
                  <span className={cn("font-display text-2xl font-black w-8 text-center", RARIDADE_TEXT_CLASS[j.raridade])}>{j.numero}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{j.nome} {j.improvisado && <span className="text-[10px] text-destructive">(improv.)</span>}</div>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span>{j.posicao}</span>
                      <span>·</span>
                      <span className={cn("font-bold", RARIDADE_TEXT_CLASS[j.raridade])}>{RARIDADE_LABEL[j.raridade]}</span>
                    </div>
                  </div>
                  <div className="font-display text-2xl font-black">{j.forcaEfetiva}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display uppercase tracking-tight text-lg mb-3">Resultados</h2>
          <div className="space-y-2">
            {s.historicoJogos.map((h, i) => (
              <HistoricoRodada key={i} h={h} meu={meu} />
            ))}
          </div>
        </section>

        <div className="space-y-2">
          {!venceu && (
            <Button onClick={() => s.tentarNovamente()} className="w-full h-12 font-display uppercase tracking-widest font-black">
              <RotateCcw className="size-4 mr-2" /> Tentar novamente
            </Button>
          )}
          <Button
            onClick={() => { s.resetar(); navigate({ to: "/dashboard" }); }}
            variant={venceu ? "default" : "outline"}
            className="w-full h-12 font-display uppercase tracking-widest font-black"
          >
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  // (Tela de partida ao vivo movida para o topo do render — ver "PRIORIDADE 1".)


  // --- LOBBY do torneio ---
  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5 pb-10">
      <header>
        <h1 className="font-display text-3xl uppercase italic tracking-tight">{tituloFase(s.fase)}</h1>
      </header>

      {s.fase === "grupos" && s.grupos[s.meuGrupoIndex] && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display uppercase text-sm tracking-widest text-muted-foreground mb-3">
            Grupo {s.grupos[s.meuGrupoIndex]!.nome}
          </h2>
          <div className="space-y-1">
            {[...s.grupos[s.meuGrupoIndex]!.times]
              .sort((a, b) => b.pts - a.pts || (b.gp - b.gc) - (a.gp - a.gc))
              .map((t, i) => (
                <div key={i} className={cn(
                  "flex items-center justify-between rounded-md px-2 py-2 text-sm",
                  !t.time.isCPU && "bg-primary/10 font-bold",
                  i < 2 && "border-l-2 border-primary",
                )}>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}</span>
                    {t.time.bandeira} <span className="truncate max-w-[150px]">{t.time.nome}</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {t.jogos}j · {t.pts}pts · {t.gp}:{t.gc}
                  </span>
                </div>
              ))}
          </div>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground text-center mt-2">
            Os 2 primeiros avançam às oitavas
          </p>
        </section>
      )}

      {s.fase !== "grupos" && s.proximoConfronto && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-3">Próximo confronto · {tituloFase(s.fase)}</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TimeBlock time={meu} />
            <div className="font-display text-2xl italic text-muted-foreground">VS</div>
            <TimeBlock time={s.proximoConfronto.casa?.isCPU ? s.proximoConfronto.casa! : s.proximoConfronto.fora!} />
          </div>
        </section>
      )}

      {s.fase === "grupos" && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Seu time</div>
          <StatsRow time={meu} />
        </section>
      )}

      {/* Velocidade */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Velocidade do jogo</div>
        <div className="grid grid-cols-3 gap-2">
          {(["normal", "rapida", "ultra"] as Velocidade[]).map(v => (
            <button key={v} onClick={() => setVelocidade(v)} className={cn(
              "rounded-lg border py-2 text-[10px] font-bold uppercase tracking-widest",
              velocidade === v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
            )}>{v}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={jogarPartida} className="h-12 font-display uppercase tracking-widest font-bold">
          <Play className="size-4 mr-1" /> Jogar
        </Button>
        <Button
          onClick={() => { s.setModoAutomatico(true); jogarPartida(); }}
          variant="outline"
          className="h-12 font-display uppercase tracking-widest font-bold"
        >
          <FastForward className="size-4 mr-1" /> Automático
        </Button>
      </div>
      {s.modoAutomatico && (
        <div className="space-y-2">
          {contagemAuto !== null && (
            <div className="space-y-1.5 animate-enter">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-1000 ease-linear"
                  style={{ width: `${(contagemAuto / (TEMPO_AUTO_PROXIMA_MS / 1000)) * 100}%` }}
                />
              </div>
              <p className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                Iniciando a próxima partida automaticamente em {contagemAuto}s...
              </p>
            </div>
          )}
          <button
            onClick={() => {
              s.setModoAutomatico(false);
              if (autoTimeoutRef.current) clearInterval(autoTimeoutRef.current);
              setContagemAuto(null);
            }}
            className="w-full text-center text-[10px] uppercase tracking-widest text-destructive underline"
          >
            Parar modo automático
          </button>
        </div>
      )}

      {s.historicoJogos.length > 0 && (
        <section>
          <h2 className="font-display uppercase tracking-tight text-sm text-muted-foreground mb-2">Resultados</h2>
          <div className="space-y-1.5">
            {s.historicoJogos.slice().reverse().map((h, i) => (
              <HistoricoRodada key={i} h={h} meu={meu} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function HistoricoRodada({ h, meu, compact }: { h: EstadoCampanha["historicoJogos"][number]; meu: Time; compact?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const eventosOrdenados = [...h.resultado.eventos].sort((a, b) => a.minuto - b.minuto);

  // Agrupa as cobranças de pênalti por rodada, para exibir casa x fora lado a lado
  const rodadasPenalti = h.penaltis
    ? Array.from(new Set(h.penaltis.cobrancas.map(c => c.rodada))).sort((a, b) => a - b).map(rodada => ({
        rodada,
        casa: h.penaltis!.cobrancas.find(c => c.rodada === rodada && c.time === "casa"),
        fora: h.penaltis!.cobrancas.find(c => c.rodada === rodada && c.time === "fora"),
      }))
    : [];

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", h.empate ? "border-yellow-500/40" : h.minhaVitoria ? "border-primary/40" : "border-destructive/30")}>
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className={cn("flex w-full items-center justify-between gap-2 px-3 text-left", compact ? "py-2 text-xs" : "py-3 text-sm")}
      >
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">{h.fase}</span>
        <span className="font-bold flex-1 truncate text-right mr-1">{h.texto}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div className="border-t border-border/60 px-3 py-2 space-y-3 animate-enter">
          {/* Linha do tempo da partida */}
          <div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
              <Zap className="size-3" /> Lance a lance
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {eventosOrdenados.map((e, i) => (
                <div key={i} className={cn(
                  "text-[11px] leading-snug",
                  e.tipo === "gol" && "font-bold text-primary",
                  e.tipo === "cartao" && "text-yellow-500",
                  e.tipo === "info" && "text-muted-foreground italic",
                )}>
                  {e.texto}
                </div>
              ))}
            </div>
          </div>

          {/* Pênaltis — casa e fora lado a lado, igual à exibição de um torneio de TV */}
          {h.penaltis && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">
                <Target className="size-3" /> Pênaltis · {h.penaltis.golsCasa}-{h.penaltis.golsFora}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-1">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground text-center">Casa</div>
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground text-center">Fora</div>
              </div>
              <div className="space-y-1">
                {rodadasPenalti.map(({ rodada, casa, fora }) => (
                  <div key={rodada} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
                    <div className="flex items-center justify-end gap-1.5 text-right">
                      <span className="font-medium truncate">{casa?.jogador ?? "—"}</span>
                      <span className={casa?.acertou ? "text-primary" : "text-destructive"}>
                        {casa ? (casa.acertou ? "⚽" : "❌") : ""}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-muted-foreground text-[9px] px-1">
                      {casa?.placarCasa ?? "·"}-{fora?.placarFora ?? "·"}
                    </span>
                    <div className="flex items-center justify-start gap-1.5 text-left">
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


function tituloFase(f: string): string {
  return {
    grupos: "Fase de Grupos", oitavas: "Oitavas de Final", quartas: "Quartas de Final",
    semi: "Semifinal", final: "FINAL", campeao: "Campeão", eliminado: "Eliminado",
  }[f] ?? f;
}

function TimeBlock({ time }: { time: Time }) {
  const st = statsTime(time);
  return (
    <div className="text-center min-w-0">
      <div className="text-3xl">{time.bandeira}</div>
      <div className="font-bold text-sm mt-1 truncate">{time.nome}</div>
      <div className="mt-2 flex justify-center gap-2 text-[10px]">
        <Stat label="FOR" value={st.forca} />
        <Stat label="ATK" value={st.ataque} />
        <Stat label="DEF" value={st.defesa} />
      </div>
    </div>
  );
}

// Mini-card vertical com o 11 inicial (cor de raridade + número + nome + força).
// Usado no resumo pós-partida para mostrar meu time e adversário lado a lado.
function TimeEscalacao({ time, titulo }: { time: Time; titulo: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground text-center mb-1">{titulo}</div>
      <div className="flex items-center gap-1 mb-2 justify-center">
        <span className="text-base">{time.isCPU ? time.bandeira : "🏆"}</span>
        <span className="font-display text-[10px] uppercase font-bold truncate">{time.nome}</span>
      </div>
      <ul className="space-y-1">
        {time.escalacao.map(j => (
          <li key={j.slotId} className={cn(
            "flex items-center gap-1.5 rounded border-l-2 bg-secondary/40 px-1.5 py-1",
            RARIDADE_BORDER_CLASS[j.raridade],
          )}>
            <span className={cn("font-display text-[10px] font-black w-4 text-center tabular-nums", RARIDADE_TEXT_CLASS[j.raridade])}>{j.numero}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold leading-tight truncate">{j.nome}</div>
              <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest">
                <span className="text-muted-foreground">{j.posicao}</span>
                <span className="text-muted-foreground">·</span>
                <span className={cn("font-bold", RARIDADE_TEXT_CLASS[j.raridade])}>{RARIDADE_LABEL[j.raridade]}</span>
              </div>
            </div>
            <span className="font-display text-xs font-black tabular-nums">{j.forcaEfetiva}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


function StatsRow({ time }: { time: Time }) {
  const st = statsTime(time);
  return (
    <div className="flex justify-around">
      <Stat label="Força" value={st.forca} />
      <Stat label="Ataque" value={st.ataque} />
      <Stat label="Defesa" value={st.defesa} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="font-display text-base font-black tabular-nums">{value || "—"}</span>
    </div>
  );
}
