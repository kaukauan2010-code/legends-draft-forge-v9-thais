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
  /** Velocidade selecionada pelo jogador para a partida — controla o ritmo do
   * movimento contínuo dos jogadores em campo (estilo futebol de botão). */
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

// Intervalo entre "passos" de movimento contínuo dos jogadores, por velocidade.
// Passos curtos + transição CSS suave dão sensação de movimento contínuo, não
// teletransporte aleatório. Em "ultra" o ritmo é mais rápido pra acompanhar
// a simulação acelerada dos 90 minutos.
const INTERVALO_MOVIMENTO_MS: Record<Velocidade, number> = {
  normal: 850,
  rapida: 500,
  ultra: 220,
};
// Quão forte cada jogador é atraído pela bola (0 = ignora, 1 = vai direto).
// Valores moderados pra acompanhar a bola sem desfazer a formação.
const ATRACAO_BOLA: Record<Velocidade, number> = {
  normal: 0.22,
  rapida: 0.32,
  ultra: 0.5,
};



// Converte as coordenadas de um time para o sistema do campo combinado:
// casa ocupa a metade de cima (seu gol em y=4, ataque avança até y≈48)
// fora ocupa a metade de baixo (seu gol em y=96, ataque avança até y≈52), espelhado.
function calcularPosicoes(time: Time, ehCasa: boolean): PosicaoBolinha[] {
  return time.formacao.slots.map(slot => {
    const jog = time.escalacao.find(j => j.slotId === slot.id);
    // slot.y: 0 = ataque do próprio time, 100 = goleiro do próprio time.
    // Casa: mapeia para 4 (seu gol) .. 48 (zona de ataque, perto do meio).
    // Fora: espelha — mapeia para 96 (seu gol) .. 52 (zona de ataque, perto do meio).
    const yCombinado = ehCasa
      ? 4 + (slot.y / 100) * 44   // y=100(gol)→48 ... y=0(ataque)→4
      : 96 - (slot.y / 100) * 44; // y=100(gol)→52 ... y=0(ataque)→96
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
  const [destaque, setDestaque] = useState<string | null>(null); // id do jogador em destaque
  // Deslocamento atual de cada jogador em relação à sua posição-base.
  // Já NÃO é aleatório — é calculado em função da posição atual da bola: jogadores
  // do time com posse avançam, o restante recua/marca, mantendo a forma geral da
  // formação. Resultado parece muito mais com futebol e menos com jogo de botão.
  const [deslocamentos, setDeslocamentos] = useState<Record<string, { dx: number; dy: number }>>({});
  const animRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const movimentoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bolaRef = useRef(bola);
  const posseRef = useRef<"casa" | "fora" | null>(null);
  bolaRef.current = bola;

  // Movimento contínuo coordenado: a cada "passo", cada jogador é puxado um pouco
  // em direção à posição que faria sentido dado onde está a bola — não com
  // movimento aleatório. Atacantes do time com posse sobem; defensores do time
  // sem posse recuam para marcar. A força e a forma da formação são preservadas.
  useEffect(() => {
    if (movimentoRef.current) clearInterval(movimentoRef.current);
    const atracao = ATRACAO_BOLA[velocidade];
    movimentoRef.current = setInterval(() => {
      const b = bolaRef.current;
      const posse = posseRef.current;
      setDeslocamentos(() => {
        const novo: Record<string, { dx: number; dy: number }> = {};
        for (const p of todasPosicoes) {
          const key = `${p.timeCasa ? "c" : "f"}-${p.id}`;
          const ehMeuTime = (p.timeCasa && posse === "casa") || (!p.timeCasa && posse === "fora");
          // alvo desejado: jogador puxado em direção à bola, mas só uma fração da
          // distância — defensores/goleiros são puxados menos (têm que segurar
          // a linha), atacantes mais. Sem time de posse, todos quase param.
          const peso = posse == null
            ? 0.05
            : ehMeuTime
              ? (p.y < 40 ? atracao * 1.2 : atracao * 0.6) // ataque sobe mais que defesa
              : (p.y < 40 ? atracao * 0.5 : atracao * 0.9); // defesa do outro time recua para marcar
          // gol não sai do gol — totalmente parado
          if (p.numero === 1 || (p.timeCasa && p.y <= 8) || (!p.timeCasa && p.y >= 92)) {
            novo[key] = { dx: 0, dy: 0 };
            continue;
          }
          const dxIdeal = (b.x - p.x) * peso;
          const dyIdeal = (b.y - p.y) * peso;
          // limita o deslocamento absoluto pra forma da formação não desaparecer
          const lim = 12;
          // Sem jitter aleatório: o movimento é puramente reativo à posição da
          // bola e ao papel tático do jogador. Resultado: muito mais parecido
          // com futebol de verdade e nada com jogo de botão.
          novo[key] = {
            dx: Math.max(-lim, Math.min(lim, dxIdeal)),
            dy: Math.max(-lim, Math.min(lim, dyIdeal)),
          };


        }
        return novo;
      });
    }, INTERVALO_MOVIMENTO_MS[velocidade]);
    return () => { if (movimentoRef.current) clearInterval(movimentoRef.current); };
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
    const intervalo = velocidade === "ultra" ? 600 : velocidade === "rapida" ? 1200 : 2000;
    microRef.current = setInterval(() => {
      // se um evento "grande" (gol/chance) acabou de tocar, deixa ele
      // terminar antes de sobrescrever a bola.
      if (Date.now() - ultimoEventoRef.current < 1600) return;
      const posseAtual = posseRef.current ?? (Math.random() < 0.5 ? "casa" : "fora");
      posseRef.current = posseAtual;
      const atacaCasa = posseAtual === "casa";
      const meuTime = atacaCasa ? posCasa : posFora;
      if (!meuTime.length) return;
      const tipoSorte = Math.random();
      // ~55% passe entre dois companheiros, 15% cruzamento, 10% chute pra fora,
      // 10% escanteio, 10% lateral.
      if (tipoSorte < 0.55) {
        // passe: bola vai do jogador A ao jogador B do mesmo time
        const a = meuTime[Math.floor(Math.random() * meuTime.length)]!;
        const b = meuTime[Math.floor(Math.random() * meuTime.length)]!;
        setBola({ x: a.x, y: a.y });
        const t = setTimeout(() => setBola({ x: b.x, y: b.y }), 250);
        animRef.current.push(t);
      } else if (tipoSorte < 0.70) {
        // cruzamento: ponta lateral pra área adversária
        const lado = Math.random() < 0.5 ? 8 : 92;
        const yLateral = atacaCasa ? 18 : 82;
        const yArea = atacaCasa ? 10 : 90;
        setBola({ x: lado, y: yLateral });
        const t = setTimeout(() => setBola({ x: 45 + Math.random() * 10, y: yArea }), 350);
        animRef.current.push(t);
      } else if (tipoSorte < 0.80) {
        // chute pra fora: vai pro gol mas sai
        const xFora = Math.random() < 0.5 ? 20 : 80;
        const yGol = atacaCasa ? 2 : 98;
        const meio = meuTime.find(p => p.y > 15 && p.y < 45) ?? meuTime[0]!;
        setBola({ x: meio.x, y: meio.y });
        const t = setTimeout(() => setBola({ x: xFora, y: yGol }), 300);
        animRef.current.push(t);
        const t2 = setTimeout(() => setBola({ x: 50, y: 50 }), 1400);
        animRef.current.push(t2);
      } else if (tipoSorte < 0.90) {
        // escanteio: bola vai pro canto da linha de fundo
        const lado = Math.random() < 0.5 ? 3 : 97;
        const yLinha = atacaCasa ? 3 : 97;
        setBola({ x: lado, y: yLinha });
        const t = setTimeout(() => setBola({ x: 50, y: atacaCasa ? 12 : 88 }), 450);
        animRef.current.push(t);
      } else {
        // lateral: bola vai pra linha lateral perto da metade do campo
        const lado = Math.random() < 0.5 ? 2 : 98;
        setBola({ x: lado, y: 30 + Math.random() * 40 });
        const t = setTimeout(() => {
          const dest = meuTime[Math.floor(Math.random() * meuTime.length)]!;
          setBola({ x: dest.x, y: dest.y });
        }, 350);
        animRef.current.push(t);
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
    <div className="relative aspect-[5/6] w-full max-w-[260px] mx-auto overflow-hidden rounded-xl border-2 border-white/10 shadow-inner"
         style={{ background: "linear-gradient(to bottom, var(--color-pitch) 0%, var(--color-pitch-dark) 50%, var(--color-pitch) 100%)" }}>
      {/* linhas */}
      <div className="pointer-events-none absolute inset-2 rounded border border-white/25" />
      <div className="absolute inset-x-2 top-1/2 h-px bg-white/25" />
      <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      <div className="absolute left-1/2 top-1 h-7 w-2/5 -translate-x-1/2 border-x border-b border-white/25" />
      <div className="absolute left-1/2 bottom-1 h-7 w-2/5 -translate-x-1/2 border-x border-t border-white/25" />

      {/* jogadores (estilo botão: bolinhas com número e cor de raridade, em movimento contínuo) */}
      {todasPosicoes.map(p => {
        const chave = `${p.timeCasa ? "c" : "f"}-${p.id}`;
        const desloc = deslocamentos[chave] ?? { dx: 0, dy: 0 };
        const xFinal = Math.min(97, Math.max(3, p.x + desloc.dx));
        const yFinal = Math.min(97, Math.max(3, p.y + desloc.dy));
        return (
          <div
            key={chave}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${xFinal}%`,
              top: `${yFinal}%`,
              transitionProperty: "left, top",
              transitionDuration: `${INTERVALO_MOVIMENTO_MS[velocidade]}ms`,
              // easeOut suave em vez de linear — jogadores chegam ao destino
              // sem aquela sensação mecânica de teletransporte.
              transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
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

      {/* bola */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out z-20"
        style={{ left: `${bola.x}%`, top: `${bola.y}%` }}
      >
        <div className="size-2.5 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
      </div>

      {/* legenda dos times */}
      <div className="absolute top-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold text-white flex items-center gap-1">
        <FlagEmoji emoji={casa.bandeira} size={12} /> {casa.nome}
      </div>
      <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 text-[8px] font-bold text-white flex items-center gap-1">
        <FlagEmoji emoji={fora.bandeira} size={12} /> {fora.nome}
      </div>
    </div>
  );
}
