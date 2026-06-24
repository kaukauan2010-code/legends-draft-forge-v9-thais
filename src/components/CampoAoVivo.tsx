import { useEffect, useRef, useState } from "react";
import type { Time } from "@/lib/simulador";
import type { EventoJogo, CobrancaPenalti } from "@/lib/simulador";
import { cn } from "@/lib/utils";
import { FlagEmoji } from "./FlagEmoji";

type Velocidade = "normal" | "rapida" | "ultra";

interface Props {
  casa: Time;
  fora: Time;
  /** Último evento processado da partida (dispara a animação de jogada) */
  eventoAtual: EventoJogo | null;
  /** Quando em modo pênaltis, a cobrança atual sendo batida */
  cobrancaAtual?: CobrancaPenalti | null;
  modo?: "partida" | "penaltis";
  /** Velocidade selecionada pelo jogador — controla a frequência de jogadas e
   *  a rapidez com que os jogadores se reposicionam (lerp por frame). */
  velocidade?: Velocidade;
}

interface PosicaoBolinha {
  id: string;
  nome: string;
  numero: number;
  raridade: string;
  x: number; // posição-base (0-100) no campo combinado
  y: number; // posição-base (0-100) no campo combinado
  timeCasa: boolean;
}

// Quão "rápido" cada jogador interpola por frame em direção ao alvo (0..1).
// Valores baixos = movimento suave/realista; altos = reativo demais.
const VEL_LERP: Record<Velocidade, number> = {
  normal: 0.025,
  rapida: 0.045,
  ultra: 0.085,
};
// Intervalo entre RECÁLCULOS de alvo (não de posição — a posição interpola
// continuamente via rAF). Alvos mudam menos vezes que frames pra ficar natural.
const INTERVALO_ALVO_MS: Record<Velocidade, number> = {
  normal: 900,
  rapida: 550,
  ultra: 260,
};




// Coordenadas internas: casa ocupa a metade "de cima" (y baixo = gol da casa),
// fora ocupa a metade "de baixo". Para renderizar HORIZONTAL, o componente abaixo
// transpõe x↔y na hora de pintar, mas a lógica de jogadas continua intacta.
function calcularPosicoes(time: Time, ehCasa: boolean): PosicaoBolinha[] {
  return time.formacao.slots.map(slot => {
    const jog = time.escalacao.find(j => j.slotId === slot.id);
    const yCombinado = ehCasa
      ? 4 + (slot.y / 100) * 44
      : 96 - (slot.y / 100) * 44;
    return {
      id: slot.id,
      nome: jog?.nome ?? "?",
      numero: jog?.numero ?? 0,
      raridade: jog?.raridade ?? "comum",
      x: slot.x,
      y: yCombinado,
      timeCasa: ehCasa,
    };
  });
}

// Cor por TIME (não por raridade): casa = azul, fora = vermelho. Era pedido
// explicitamente pelo usuário para distinguir os times no campo ao vivo.
const COR_CASA = "bg-blue-600 border-blue-300";
const COR_FORA = "bg-red-600 border-red-300";

export function CampoAoVivo({ casa, fora, eventoAtual, cobrancaAtual, modo = "partida", velocidade = "rapida" }: Props) {
  const posCasa = calcularPosicoes(casa, true);
  const posFora = calcularPosicoes(fora, false);
  const todasPosicoes = [...posCasa, ...posFora];

  const [bola, setBola] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [destaque, setDestaque] = useState<string | null>(null);
  // Posição interpolada de cada jogador (atualizada a 60fps via rAF, NUNCA por
  // setInterval). Isso elimina o "snap" de futebol de botão — cada jogador anda
  // suavemente em direção ao alvo que muda conforme a bola e a posse.
  const [deslocamentos, setDeslocamentos] = useState<Record<string, { dx: number; dy: number }>>({});
  const deslocRef = useRef<Record<string, { dx: number; dy: number }>>({});
  const alvosRef = useRef<Record<string, { dx: number; dy: number; runUntil: number }>>({});
  const animRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafRef = useRef<number | null>(null);
  const alvoTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bolaRef = useRef(bola);
  const posseRef = useRef<"casa" | "fora" | null>(null);
  bolaRef.current = bola;

  // === Recalcula ALVO de cada jogador periodicamente (não a posição em si).
  // Atacantes do time com posse fazem "corridas" pra frente; meio-campistas
  // giram pra dar opção de passe; defensores recuam em bloco quando o outro
  // time ataca. Um leve componente aleatório simula desmarcação natural.
  useEffect(() => {
    if (alvoTickRef.current) clearInterval(alvoTickRef.current);
    alvoTickRef.current = setInterval(() => {
      const b = bolaRef.current;
      const posse = posseRef.current;
      const agora = performance.now();
      const novos: Record<string, { dx: number; dy: number; runUntil: number }> = {};
      for (const p of todasPosicoes) {
        const key = `${p.timeCasa ? "c" : "f"}-${p.id}`;
        const anterior = alvosRef.current[key];
        // Mantém corrida atual até terminar — dá continuidade de movimento.
        if (anterior && anterior.runUntil > agora) {
          novos[key] = anterior;
          continue;
        }
        // Goleiro fica preso ao gol, só desloca lateralmente seguindo a bola.
        const ehGoleiro = p.numero === 1 || (p.timeCasa && p.y <= 8) || (!p.timeCasa && p.y >= 92);
        if (ehGoleiro) {
          const lateral = (b.x - p.x) * 0.15;
          novos[key] = { dx: Math.max(-6, Math.min(6, lateral)), dy: 0, runUntil: agora + 600 };
          continue;
        }
        const ehMeuTime = (p.timeCasa && posse === "casa") || (!p.timeCasa && posse === "fora");
        const ehAtacante = p.timeCasa ? p.y < 28 : p.y > 72;
        const ehMeio = p.timeCasa ? p.y >= 28 && p.y < 42 : p.y > 58 && p.y <= 72;
        // Componente direcional (puxa pela bola/papel) + componente aleatório
        // (desmarcação/oscilação). A soma evita movimento mecânico.
        let pesoX = 0.15, pesoY = 0.15;
        if (posse != null) {
          if (ehMeuTime) {
            // ataque sobe pra frente da bola; meio gira lateral; defesa fecha
            pesoX = ehAtacante ? 0.35 : ehMeio ? 0.22 : 0.10;
            pesoY = ehAtacante ? 0.45 : ehMeio ? 0.28 : 0.12;
          } else {
            // marcação: defesa recua em bloco, meio fecha espaço
            pesoX = ehAtacante ? 0.12 : ehMeio ? 0.25 : 0.30;
            pesoY = ehAtacante ? 0.10 : ehMeio ? 0.30 : 0.38;
          }
        }
        const dirX = (b.x - p.x) * pesoX;
        const dirY = (b.y - p.y) * pesoY;
        // ruído de "corrida em diagonal" — magnitude pequena, pra desmarcar
        const ruidoX = (Math.random() - 0.5) * (ehAtacante ? 8 : 4);
        const ruidoY = (Math.random() - 0.5) * (ehAtacante ? 6 : 3);
        const lim = ehAtacante ? 16 : ehMeio ? 12 : 8;
        novos[key] = {
          dx: Math.max(-lim, Math.min(lim, dirX + ruidoX)),
          dy: Math.max(-lim, Math.min(lim, dirY + ruidoY)),
          runUntil: agora + INTERVALO_ALVO_MS[velocidade] * (0.6 + Math.random() * 0.8),
        };
      }
      alvosRef.current = novos;
    }, INTERVALO_ALVO_MS[velocidade]);
    return () => { if (alvoTickRef.current) clearInterval(alvoTickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [velocidade, casa.nome, fora.nome]);

  // === Loop de interpolação a 60fps: a cada frame, puxa a posição atual de
  // cada jogador um pouco mais perto do alvo. Resultado = movimento contínuo
  // e fluido, sem "saltos" entre posições.
  useEffect(() => {
    const lerp = VEL_LERP[velocidade];
    const tick = () => {
      const atuais = deslocRef.current;
      const alvos = alvosRef.current;
      const novo: Record<string, { dx: number; dy: number }> = {};
      let mudou = false;
      for (const p of todasPosicoes) {
        const key = `${p.timeCasa ? "c" : "f"}-${p.id}`;
        const a = atuais[key] ?? { dx: 0, dy: 0 };
        const alvo = alvos[key] ?? { dx: 0, dy: 0 };
        const ndx = a.dx + (alvo.dx - a.dx) * lerp;
        const ndy = a.dy + (alvo.dy - a.dy) * lerp;
        novo[key] = { dx: ndx, dy: ndy };
        if (Math.abs(ndx - a.dx) > 0.01 || Math.abs(ndy - a.dy) > 0.01) mudou = true;
      }
      deslocRef.current = novo;
      if (mudou) setDeslocamentos(novo);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [velocidade, casa.nome, fora.nome]);


  // Jogadas "de enchimento" entre eventos do simulador: passe entre dois
  // companheiros do time com posse, cruzamento, escanteio, lateral, chute
  // pra fora. Dão a sensação de um jogo de verdade rolando em vez de a
  // bola ficar parada no meio quando não há evento ofensivo. Só roda em
  // modo partida (não durante pênaltis).
  const microRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ultimoEventoRef = useRef<number>(0);
  useEffect(() => {
    if (modo !== "partida") return;
    if (microRef.current) clearInterval(microRef.current);
    // intervalo entre micro-jogadas escala com a velocidade
    const intervalo = velocidade === "ultra" ? 800 : velocidade === "rapida" ? 1500 : 2500;
    microRef.current = setInterval(() => {
      // se um evento "grande" (gol/chance) acabou de tocar, deixa ele
      // terminar antes de sobrescrever a bola.
      if (Date.now() - ultimoEventoRef.current < 2000) return;
      const posseAtual = posseRef.current ?? (Math.random() < 0.5 ? "casa" : "fora");
      posseRef.current = posseAtual;
      const atacaCasa = posseAtual === "casa";
      const meuTime = atacaCasa ? posCasa : posFora;
      const timeDef = atacaCasa ? posFora : posCasa;
      if (!meuTime.length) return;
      const tipoSorte = Math.random();
      // ~45% passe curto, 15% passe longo, 12% cruzamento, 8% chute,
      // 8% escanteio, 7% lateral, 5% troca de posse
      if (tipoSorte < 0.35) {
        // TRIANGULAÇÃO — passe A→B→C em sequência, jogadores próximos
        const a = meuTime[Math.floor(Math.random() * meuTime.length)]!;
        const proxA = meuTime.filter(p => p.id !== a.id && Math.abs(p.y - a.y) < 22 && Math.abs(p.x - a.x) < 30);
        const b = proxA.length ? proxA[Math.floor(Math.random() * proxA.length)]! : meuTime[Math.floor(Math.random() * meuTime.length)]!;
        const proxB = meuTime.filter(p => p.id !== a.id && p.id !== b.id && Math.abs(p.y - b.y) < 22);
        // 3º vértice da triangulação preferencialmente mais à frente
        const cand = proxB.filter(p => atacaCasa ? p.y < b.y : p.y > b.y);
        const c = (cand.length ? cand : proxB.length ? proxB : meuTime)[Math.floor(Math.random() * (cand.length || proxB.length || meuTime.length))]!;
        setBola({ x: a.x, y: a.y });
        const t1 = setTimeout(() => setBola({ x: b.x, y: b.y }), 280);
        const t2 = setTimeout(() => setBola({ x: c.x + (Math.random() - 0.5) * 3, y: c.y + (Math.random() - 0.5) * 3 }), 560);
        animRef.current.push(t1, t2);
      } else if (tipoSorte < 0.50) {
        // passe curto entre dois companheiros próximos
        const a = meuTime[Math.floor(Math.random() * meuTime.length)]!;
        const proximos = meuTime.filter(p => p.id !== a.id && Math.abs(p.y - a.y) < 20);
        const b = proximos.length ? proximos[Math.floor(Math.random() * proximos.length)]! : meuTime[Math.floor(Math.random() * meuTime.length)]!;
        setBola({ x: a.x, y: a.y });
        const t = setTimeout(() => setBola({ x: b.x + (Math.random() - 0.5) * 3, y: b.y + (Math.random() - 0.5) * 3 }), 350);
        animRef.current.push(t);
      } else if (tipoSorte < 0.60) {
        // passe longo para a frente
        const origem = meuTime.filter(p => atacaCasa ? p.y > 30 : p.y < 70);
        const destino = meuTime.filter(p => atacaCasa ? p.y < 35 : p.y > 65);
        const a = (origem.length ? origem : meuTime)[Math.floor(Math.random() * (origem.length || meuTime.length))]!;
        const b = (destino.length ? destino : meuTime)[Math.floor(Math.random() * (destino.length || meuTime.length))]!;
        setBola({ x: a.x, y: a.y });
        const t = setTimeout(() => setBola({ x: b.x + (Math.random() - 0.5) * 5, y: b.y }), 500);
        animRef.current.push(t);
      } else if (tipoSorte < 0.72) {
        // cruzamento: ponta lateral pra área adversária
        const lado = Math.random() < 0.5 ? 8 : 92;
        const yLateral = atacaCasa ? 20 : 80;
        const yArea = atacaCasa ? 10 : 90;
        setBola({ x: lado, y: yLateral });
        const t = setTimeout(() => setBola({ x: 40 + Math.random() * 20, y: yArea }), 450);
        animRef.current.push(t);
      } else if (tipoSorte < 0.80) {
        // chute a gol (defesa salva ou sai)
        const atacantes = meuTime.filter(p => atacaCasa ? p.y < 25 : p.y > 75);
        const bat = atacantes.length ? atacantes[Math.floor(Math.random() * atacantes.length)]! : meuTime[0]!;
        const yGol = atacaCasa ? 4 : 96;
        setBola({ x: bat.x, y: bat.y });
        const t = setTimeout(() => setBola({ x: 42 + Math.random() * 16, y: yGol }), 400);
        animRef.current.push(t);
        const t2 = setTimeout(() => {
          // goleiro "defende": bola vai para canto ou área
          setBola({ x: 20 + Math.random() * 60, y: atacaCasa ? 12 : 88 });
        }, 900);
        animRef.current.push(t2);
        const t3 = setTimeout(() => setBola({ x: 50, y: 50 }), 1800);
        animRef.current.push(t3);
      } else if (tipoSorte < 0.88) {
        // escanteio: bola vai pro canto → cabeceio na área
        const lado = Math.random() < 0.5 ? 3 : 97;
        const yLinha = atacaCasa ? 3 : 97;
        setBola({ x: lado, y: yLinha });
        const t = setTimeout(() => setBola({ x: 45 + Math.random() * 10, y: atacaCasa ? 12 : 88 }), 600);
        animRef.current.push(t);
        const t2 = setTimeout(() => setBola({ x: 50, y: 50 }), 1500);
        animRef.current.push(t2);
      } else if (tipoSorte < 0.95) {
        // lateral: bola vai pra linha e volta para campo
        const lado = Math.random() < 0.5 ? 2 : 98;
        setBola({ x: lado, y: 25 + Math.random() * 50 });
        const t = setTimeout(() => {
          const dest = meuTime[Math.floor(Math.random() * meuTime.length)]!;
          setBola({ x: dest.x, y: dest.y });
        }, 450);
        animRef.current.push(t);
      } else {
        // troca de posse: adversário rouba a bola
        posseRef.current = atacaCasa ? "fora" : "casa";
        const roubador = timeDef[Math.floor(Math.random() * timeDef.length)];
        if (roubador) setBola({ x: roubador.x, y: roubador.y });
      }
    }, intervalo);
    return () => { if (microRef.current) clearInterval(microRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, velocidade, casa.nome, fora.nome]);


  useEffect(() => {
    // limpa animações pendentes da jogada anterior
    animRef.current.forEach(t => clearTimeout(t));
    animRef.current = [];

    if (modo === "penaltis") return; // tratado em outro efeito abaixo

    if (!eventoAtual) {
      setBola({ x: 50, y: 50 });
      setDestaque(null);
      return;
    }

    const atacaCasa = eventoAtual.time === "casa";
    const semTime = !eventoAtual.time;
    if (semTime) {
      posseRef.current = null;
      setBola({ x: 50, y: 50 });
      setDestaque(null);
      return;
    }
    posseRef.current = atacaCasa ? "casa" : "fora";
    ultimoEventoRef.current = Date.now();


    // Escolhe um jogador ofensivo aleatório do time que está com a jogada,
    // para destacar e usar como "origem" do lance.
    const candidatos = (atacaCasa ? posCasa : posFora).filter(p => p.y < 60 && p.y > 5);
    const jogador = candidatos[Math.floor(Math.random() * candidatos.length)] ?? (atacaCasa ? posCasa : posFora)[0]!;
    setDestaque(jogador?.id ?? null);

    // Ponto de chegada do lance: gol do time adversário se for "gol", senão
    // perto da área adversária para "chance", ou posição neutra para o resto.
    const golAdversarioY = atacaCasa ? 4 : 96;
    const areaAdversariaY = atacaCasa ? 14 : 86;
    const destinoY = eventoAtual.tipo === "gol" ? golAdversarioY
      : eventoAtual.tipo === "chance" ? areaAdversariaY
      : jogador?.y ?? 50;
    const destinoX = eventoAtual.tipo === "gol" || eventoAtual.tipo === "chance"
      ? 35 + Math.random() * 30
      : jogador?.x ?? 50;

    setBola({ x: jogador?.x ?? 50, y: jogador?.y ?? 50 });
    const t1 = setTimeout(() => setBola({ x: destinoX, y: destinoY }), 80);
    animRef.current.push(t1);
    if (eventoAtual.tipo === "gol" || eventoAtual.tipo === "chance") {
      const t2 = setTimeout(() => setBola({ x: 50, y: 50 }), 1400);
      animRef.current.push(t2);
    }

    return () => { animRef.current.forEach(t => clearTimeout(t)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoAtual?.minuto, eventoAtual?.tipo, eventoAtual?.texto, modo]);

  // Animação de pênaltis: bola sai do batedor até o gol
  useEffect(() => {
    if (modo !== "penaltis" || !cobrancaAtual) return;
    animRef.current.forEach(t => clearTimeout(t));
    animRef.current = [];

    const ehCasa = cobrancaAtual.time === "casa";
    const golAdversarioY = ehCasa ? 4 : 96;
    setDestaque(null);
    setBola({ x: 50, y: ehCasa ? 40 : 60 }); // marca do pênalti (lado de quem bate)
    const t1 = setTimeout(() => {
      setBola({
        x: cobrancaAtual.acertou ? 42 + Math.random() * 16 : 20 + Math.random() * 60,
        y: golAdversarioY,
      });
    }, 250);
    animRef.current.push(t1);
    const t2 = setTimeout(() => setBola({ x: 50, y: 50 }), 1800);
    animRef.current.push(t2);

    return () => { animRef.current.forEach(t => clearTimeout(t)); };
  }, [cobrancaAtual?.rodada, cobrancaAtual?.time, modo]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border-2 border-white/10 shadow-inner"
         style={{ background: "linear-gradient(to right, var(--color-pitch) 0%, var(--color-pitch-dark) 50%, var(--color-pitch) 100%)" }}>
      {/* linhas do campo (horizontal: meio-de-campo vertical, áreas nas laterais) */}
      <div className="pointer-events-none absolute inset-2 rounded border border-white/25" />
      {/* linha de meio-campo (vertical) */}
      <div className="absolute inset-y-2 left-1/2 w-px bg-white/25" />
      {/* círculo central */}
      <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      {/* área esquerda (gol da casa) */}
      <div className="absolute top-1/2 left-1 w-7 h-2/5 -translate-y-1/2 border-y border-r border-white/25" />
      {/* área direita (gol do fora) */}
      <div className="absolute top-1/2 right-1 w-7 h-2/5 -translate-y-1/2 border-y border-l border-white/25" />

      {/* jogadores — transpõe internamente: x interno (largura do time) vira top,
          y interno (eixo de ataque) vira left. Resultado: casa à esquerda, fora à direita. */}
      {todasPosicoes.map(p => {
        const chave = `${p.timeCasa ? "c" : "f"}-${p.id}`;
        const desloc = deslocamentos[chave] ?? { dx: 0, dy: 0 };
        const xInterno = Math.min(97, Math.max(3, p.x + desloc.dx));
        const yInterno = Math.min(97, Math.max(3, p.y + desloc.dy));
        // transpor: left = yInterno (campo de ataque), top = xInterno (largura)
        const leftFinal = yInterno;
        const topFinal = xInterno;
        return (
          <div
            key={chave}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${leftFinal}%`,
              top: `${topFinal}%`,
              // sem transição CSS — o rAF já interpola posição a cada frame
            }}
          >
            <div
              className={cn(
                "grid size-5 place-items-center rounded-full border text-[7px] font-black text-white shadow",
                p.timeCasa ? COR_CASA : COR_FORA,
                !p.timeCasa && "opacity-90",
                destaque === p.id && "ring-2 ring-white scale-150 z-10",
              )}
              title={p.nome}
            >
              {p.numero}
            </div>
          </div>
        );
      })}

      {/* bola — também transposta */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
        style={{
          left: `${bola.y}%`,
          top: `${bola.x}%`,
          transitionProperty: "left, top",
          transitionDuration: "400ms",
          transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        }}
      >
        <div className="size-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.5)]" />
      </div>

      {/* legenda dos times — casa à esquerda, fora à direita */}
      <div className="absolute top-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold text-white flex items-center gap-1">
        <FlagEmoji emoji={casa.bandeira} size={12} /> {casa.nome}
      </div>
      <div className="absolute top-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold text-white flex items-center gap-1">
        <FlagEmoji emoji={fora.bandeira} size={12} /> {fora.nome}
      </div>
    </div>
  );
}
