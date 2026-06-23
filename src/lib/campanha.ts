// @ts-nocheck
// ============================================================
// Estado da campanha: persistido no sessionStorage, gerenciado com Zustand
// ============================================================
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FormacaoId, SlotPosicional } from "./formacoes";
import { FORMACOES } from "./formacoes";
import type { Estrategia, JogadorEscalado, Time, ResultadoPartida } from "./simulador";
import { montarVariosTimesCPU, simularPartida, simularPlacarRapido, simularPenaltis } from "./simulador";
import type { ResultadoPenaltis } from "./simulador";
import type { Jogador, Selecao } from "./selecoes";
import { posicoesCompativeis, SELECOES } from "./selecoes";

export type Modo = "classico" | "almanaque";
export type FaseTorneio = "grupos" | "oitavas" | "quartas" | "semi" | "final" | "campeao" | "eliminado";

export interface ConfigCampanha {
  modo: Modo;
  formacaoId: FormacaoId;
  estrategia: Estrategia;
  nomeTime: string;
}

export interface ConfrontoMata {
  id: string;
  casa: Time | null;       // null até o confronto anterior definir quem chega aqui
  fora: Time | null;
  vencedor?: Time;
  resultado?: ResultadoPartida;
  penaltis?: ResultadoPenaltis;
}

export interface LinhaGrupo {
  time: Time;
  pts: number;
  gp: number;
  gc: number;
  jogos: number;
  vit: number;
  emp: number;
  der: number;
}

export interface Grupo {
  nome: string; // "A", "B", "C", "D"
  times: LinhaGrupo[];
}

export interface ChaveMata {
  oitavas: ConfrontoMata[];  // 8 confrontos
  quartas: ConfrontoMata[];  // 4 confrontos
  semi: ConfrontoMata[];     // 2 confrontos
  final: ConfrontoMata[];    // 1 confronto
}

export interface EstadoCampanha {
  ativa: boolean;
  config: ConfigCampanha | null;
  rerollsRestantes: number;
  selecoesUsadas: string[];      // IDs já oferecidos no draft
  selecaoAtual: Selecao | null;   // sorteada na rodada atual
  escalacao: JogadorEscalado[];   // jogadores já escolhidos
  slotsRestantes: SlotPosicional[];
  jogadorPendente: Jogador | null; // aguardando o usuário escolher o slot
  nomesJaEscolhidos: string[];     // nomes de jogador já escalados (bloqueia duplicatas, ex: "Neymar" em anos diferentes)
  // torneio
  fase: FaseTorneio;
  grupos: Grupo[];                // 4 grupos de 4 times
  meuGrupoIndex: number;          // índice do grupo onde está o jogador
  chave: ChaveMata;
  proximoConfronto: ConfrontoMata | null; // confronto mata-mata atual do jogador
  historicoJogos: { fase: string; texto: string; resultado: ResultadoPartida; minhaVitoria: boolean; empate?: boolean; penaltis?: ResultadoPenaltis }[];
  trocasRestantes: number;
  // controle de exibição de telas intermediárias (grupos completos / chaveamento)
  mostrarApresentacaoGrupos: boolean;
  mostrarChaveamento: FaseTorneio | null; // qual fase de mata-mata mostrar o chaveamento antes de jogar
  modoAutomatico: boolean;
}

interface CampanhaActions {
  iniciar: (c: ConfigCampanha) => void;
  sortearProxima: () => void;
  escolherJogador: (j: Jogador) => boolean;
  posicionarEm: (slotId: string) => boolean;
  cancelarPendente: () => void;
  usarReroll: () => void;
  excluirJogador: (slotId: string) => boolean;
  forcarFimDraft: () => void;
  comecarTorneio: () => void;
  confirmarApresentacaoGrupos: () => void;
  confirmarChaveamento: () => void;
  simularProximaPartida: () => ResultadoPartida | null;
  resetar: () => void;
  tentarNovamente: () => void;
  setModoAutomatico: (v: boolean) => void;
  meuTime: () => Time | null;
  adversarioAtual: () => Time | null;
}

const NOMES_GRUPOS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function estadoInicial(): EstadoCampanha {
  return {
    ativa: false, config: null, rerollsRestantes: 0,
    selecoesUsadas: [], selecaoAtual: null,
    escalacao: [], slotsRestantes: [], jogadorPendente: null,
    nomesJaEscolhidos: [],
    fase: "grupos", grupos: [], meuGrupoIndex: 0,
    chave: { oitavas: [], quartas: [], semi: [], final: [] },
    proximoConfronto: null,
    historicoJogos: [], trocasRestantes: 0,
    mostrarApresentacaoGrupos: false, mostrarChaveamento: null,
    modoAutomatico: false,
  };
}

function linhaVazia(time: Time): LinhaGrupo {
  return { time, pts: 0, gp: 0, gc: 0, jogos: 0, vit: 0, emp: 0, der: 0 };
}

function aplicarResultado(casa: LinhaGrupo, fora: LinhaGrupo, golsCasa: number, golsFora: number) {
  casa.jogos++; fora.jogos++;
  casa.gp += golsCasa; casa.gc += golsFora;
  fora.gp += golsFora; fora.gc += golsCasa;
  if (golsCasa > golsFora) { casa.pts += 3; casa.vit++; fora.der++; }
  else if (golsCasa < golsFora) { fora.pts += 3; fora.vit++; casa.der++; }
  else { casa.pts++; fora.pts++; casa.emp++; fora.emp++; }
}

function ordenarGrupo(g: Grupo): LinhaGrupo[] {
  return [...g.times].sort((a, b) =>
    b.pts - a.pts || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp);
}

function novoConfronto(id: string, casa: Time | null, fora: Time | null): ConfrontoMata {
  return { id, casa, fora };
}

export const useCampanha = create<EstadoCampanha & CampanhaActions>()(
  persist(
    (set, get) => ({
      ...estadoInicial(),

      iniciar: (config) => {
        const formacao = FORMACOES[config.formacaoId];
        set({
          ...estadoInicial(),
          ativa: true, config,
          rerollsRestantes: config.modo === "classico" ? 3 : 1,
          trocasRestantes: config.modo === "classico" ? 3 : 1,
          slotsRestantes: [...formacao.slots],
        });
        // NÃO sorteia automaticamente — o usuário aperta o botão "Sortear seleção".
      },

      sortearProxima: () => {
        const s = get();
        if (!s.slotsRestantes.length) return;
        // Garante que o time sorteado tenha pelo menos um jogador disponível
        // para algum slot livre — evita gastar reroll com time "bloqueado"
        // (ex: time só com CA quando precisamos de PE/PD/ATA).
        const posicoesLivres = new Set(s.slotsRestantes.map(sl => sl.posicao));
        const temJogadorUsavel = (sel: Selecao) =>
          sel.jogadores.some(j =>
            !s.nomesJaEscolhidos.includes(j.nome) &&
            posicoesCompativeis(j.posicao).some(p => posicoesLivres.has(p))
          );
        let pool = SELECOES.filter(sel => !s.selecoesUsadas.includes(sel.id) && temJogadorUsavel(sel));
        if (!pool.length) pool = SELECOES.filter(temJogadorUsavel);
        if (!pool.length) pool = SELECOES;
        const sel = pool[Math.floor(Math.random() * pool.length)]!;
        set({
          selecaoAtual: sel,
          selecoesUsadas: [...s.selecoesUsadas, sel.id],
          jogadorPendente: null,
        });
      },

      escolherJogador: (jog) => {
        const s = get();
        if (!s.selecaoAtual || !s.slotsRestantes.length) return false;
        if (s.nomesJaEscolhidos.includes(jog.nome)) return false; // já escalado em outro ano/versão
        const posicoesAceitas = posicoesCompativeis(jog.posicao);
        const slotsCompat = s.slotsRestantes.filter(sl => posicoesAceitas.includes(sl.posicao));
        if (!slotsCompat.length) return false;
        // SEMPRE entra em modo "pendente" — o usuário deve clicar o slot
        // no campo, mesmo quando há apenas uma opção compatível.
        set({ jogadorPendente: jog });
        return true;
      },

      posicionarEm: (slotId) => {
        const s = get();
        const jog = s.jogadorPendente;
        if (!jog) return false;
        const slot = s.slotsRestantes.find(sl => sl.id === slotId);
        if (!slot) return false;
        const posicoesAceitas = posicoesCompativeis(jog.posicao);
        if (!posicoesAceitas.includes(slot.posicao)) return false;
        const escalado: JogadorEscalado = {
          ...jog, slotId: slot.id, improvisado: jog.posicao !== slot.posicao, forcaEfetiva: jog.forca,
        };
        const restantes = s.slotsRestantes.filter(sl => sl.id !== slot.id);
        set({
          escalacao: [...s.escalacao, escalado],
          slotsRestantes: restantes,
          jogadorPendente: null,
          nomesJaEscolhidos: [...s.nomesJaEscolhidos, jog.nome],
          // Limpa a seleção atual: usuário precisa apertar "Sortear" para a próxima.
          selecaoAtual: null,
        });
        return true;
      },

      cancelarPendente: () => set({ jogadorPendente: null }),

      usarReroll: () => {
        const s = get();
        if (s.rerollsRestantes <= 0) return;
        set({ rerollsRestantes: s.rerollsRestantes - 1 });
        get().sortearProxima();
      },

      excluirJogador: (slotId) => {
        const s = get();
        if (s.trocasRestantes <= 0) return false;
        const jog = s.escalacao.find(j => j.slotId === slotId);
        if (!jog) return false;
        const formacao = s.config ? FORMACOES[s.config.formacaoId] : null;
        const slotDef = formacao?.slots.find(sl => sl.id === slotId);
        if (!slotDef) return false;
        // Trocar NÃO consome reroll, e libera de volta o nome do jogador
        // (para poder ser escolhido de novo se aparecer novamente no sorteio,
        // ou para liberar espaço de posição imediatamente).
        set({
          escalacao: s.escalacao.filter(j => j.slotId !== slotId),
          slotsRestantes: [...s.slotsRestantes, slotDef],
          trocasRestantes: s.trocasRestantes - 1,
          nomesJaEscolhidos: s.nomesJaEscolhidos.filter(n => n !== jog.nome),
          jogadorPendente: null,
          // NÃO mexe em selecaoAtual nem em rerollsRestantes — a seleção sorteada
          // atual (se houver) continua válida, e o reroll não é consumido.
        });
        return true;
      },

      forcarFimDraft: () => {
        const s = get();
        if (!s.slotsRestantes.length) return;
        // Se já tem jogador pendente, escolhe um slot aleatório compatível
        if (s.jogadorPendente) {
          const posicoesAceitas = posicoesCompativeis(s.jogadorPendente.posicao);
          const compat = s.slotsRestantes.filter(sl => posicoesAceitas.includes(sl.posicao));
          if (compat.length) {
            get().posicionarEm(compat[Math.floor(Math.random() * compat.length)]!.id);
            return;
          }
        }
        if (!s.selecaoAtual) {
          // Sem seleção sorteada: força o sorteio automático
          get().sortearProxima();
          return;
        }
        // Escolhe um jogador da seleção atual cuja posição tenha slot livre e cujo nome
        // ainda não tenha sido escalado
        const posicoesLivres = new Set(s.slotsRestantes.map(sl => sl.posicao));
        const candidatos = s.selecaoAtual.jogadores.filter(p =>
          !s.nomesJaEscolhidos.includes(p.nome) &&
          posicoesCompativeis(p.posicao).some(pos => posicoesLivres.has(pos)),
        );
        if (!candidatos.length) {
          get().sortearProxima();
          return;
        }
        const auto = candidatos[Math.floor(Math.random() * candidatos.length)]!;
        get().escolherJogador(auto);
        const s2 = get();
        if (s2.jogadorPendente) {
          const posicoesAceitas = posicoesCompativeis(s2.jogadorPendente.posicao);
          const compat = s2.slotsRestantes.filter(sl => posicoesAceitas.includes(sl.posicao));
          if (compat.length) get().posicionarEm(compat[Math.floor(Math.random() * compat.length)]!.id);
        }
      },

      setModoAutomatico: (v) => set({ modoAutomatico: v }),

      meuTime: () => {
        const s = get();
        if (!s.config || s.escalacao.length < 11) return null;
        return {
          nome: s.config.nomeTime || "Meu Time",
          bandeira: "🏆",
          formacao: FORMACOES[s.config.formacaoId],
          estrategia: s.config.estrategia,
          escalacao: s.escalacao,
          isCPU: false,
        };
      },

      adversarioAtual: () => {
        const s = get();
        if (s.fase === "grupos") {
          const grupo = s.grupos[s.meuGrupoIndex];
          if (!grupo) return null;
          const minhaLinha = grupo.times.find(t => !t.time.isCPU);
          const jogosMeu = minhaLinha?.jogos ?? 0;
          const adversariosNoGrupo = grupo.times.filter(t => t.time.isCPU);
          return adversariosNoGrupo[jogosMeu]?.time ?? null;
        }
        // No mata-mata, o jogador pode ser "casa" ou "fora" dependendo de como o
        // chaveamento foi montado — identifica o adversário pela flag isCPU, não
        // assumindo uma posição fixa.
        const confronto = s.proximoConfronto;
        if (!confronto) return null;
        if (confronto.casa && !confronto.casa.isCPU) return confronto.fora ?? null;
        return confronto.casa ?? null;
      },

      comecarTorneio: () => {
        const s = get();
        const meu = get().meuTime();
        if (!meu || !s.config) return;
        const formacao = FORMACOES[s.config.formacaoId];
        // 32 times ao todo: eu + 31 CPUs, distribuídos em 8 grupos de 4 (formato Copa do Mundo).
        // CPUs ficam com -15 de força efetiva — o que era "100% de dificuldade"
        // passa a ser ~60%, deixando o usuário com cerca de 40% de chance real de
        // ganhar até as fases finais (em vez do quase-impossível anterior).
        const cpus = montarVariosTimesCPU(formacao, 31, -15);

        const meuGrupoIndex = Math.floor(Math.random() * 8);
        const grupos: Grupo[] = NOMES_GRUPOS.map(nome => ({ nome, times: [] as LinhaGrupo[] }));
        // distribuição: cada grupo recebe exatamente 4 times. O grupo do jogador
        // recebe ele + 3 CPUs; os outros 7 grupos recebem 4 CPUs cada.
        let cpuIdx = 0;
        for (let gi = 0; gi < 8; gi++) {
          const slotsNoGrupo = gi === meuGrupoIndex ? 3 : 4;
          const timesDoGrupo: Time[] = gi === meuGrupoIndex ? [meu] : [];
          for (let k = 0; k < slotsNoGrupo; k++) {
            timesDoGrupo.push(cpus[cpuIdx]!);
            cpuIdx++;
          }
          grupos[gi]!.times = timesDoGrupo.map(linhaVazia);
        }
        set({
          fase: "grupos", grupos, meuGrupoIndex,
          chave: { oitavas: [], quartas: [], semi: [], final: [] },
          proximoConfronto: null, historicoJogos: [],
          mostrarApresentacaoGrupos: true, mostrarChaveamento: null,
        });
      },

      confirmarApresentacaoGrupos: () => set({ mostrarApresentacaoGrupos: false }),
      confirmarChaveamento: () => set({ mostrarChaveamento: null }),

      simularProximaPartida: () => {
        const s = get();
        const meu = get().meuTime();
        if (!meu || !s.config) return null;
        const formacao = FORMACOES[s.config.formacaoId];

        // ====== FASE DE GRUPOS ======
        if (s.fase === "grupos") {
          const grupo = s.grupos[s.meuGrupoIndex];
          if (!grupo) return null;
          const minhaLinha = grupo.times.find(t => !t.time.isCPU)!;
          const jogosMeu = minhaLinha.jogos;

          if (jogosMeu >= 3) {
            // Todos os jogos de grupo do jogador já ocorreram. Simula (rápido) os
            // jogos pendentes entre CPUs em TODOS os 8 grupos para fechar a fase
            // e poder montar a classificação completa.
            const gruposAtualizados = s.grupos.map(g => {
              const times = g.times.map(t => ({ ...t }));
              for (let i = 0; i < times.length; i++) {
                for (let j = i + 1; j < times.length; j++) {
                  const a = times[i]!, b = times[j]!;
                  if (a.time.isCPU && b.time.isCPU && a.jogos < 3 && b.jogos < 3) {
                    const r = simularPlacarRapido(a.time, b.time);
                    aplicarResultado(a, b, r.golsCasa, r.golsFora);
                  }
                }
              }
              return { ...g, times };
            });

            const meuGrupoFinal = gruposAtualizados[s.meuGrupoIndex]!;
            const classificados = ordenarGrupo(meuGrupoFinal).slice(0, 2);
            const passou = classificados.some(t => !t.time.isCPU);
            if (!passou) {
              set({ grupos: gruposAtualizados, fase: "eliminado" });
              return null;
            }

            // Monta as oitavas com os 16 classificados (top 2 de cada um dos 8 grupos),
            // usando o cruzamento clássico de Copa do Mundo: 1º de um grupo encara o
            // 2º do grupo "parceiro" (A↔B, C↔D, E↔F, G↔H), evitando que dois times do
            // mesmo grupo se enfrentem logo na primeira fase do mata-mata.
            const classifPorGrupo = gruposAtualizados.map(g => ordenarGrupo(g).slice(0, 2));
            const par = (i: number, j: number) => {
              const [iPrimeiro, iSegundo] = classifPorGrupo[i]!;
              const [jPrimeiro, jSegundo] = classifPorGrupo[j]!;
              return [
                novoConfronto(`oit-${i}-${j}-1`, iPrimeiro!.time, jSegundo!.time),
                novoConfronto(`oit-${i}-${j}-2`, jPrimeiro!.time, iSegundo!.time),
              ];
            };
            const oitavasFinal: ConfrontoMata[] = [
              ...par(0, 1), // A x B
              ...par(2, 3), // C x D
              ...par(4, 5), // E x F
              ...par(6, 7), // G x H
            ];
            let meuConfronto = oitavasFinal.find(c => !c.casa?.isCPU || !c.fora?.isCPU) ?? null;
            // Normaliza: se o jogador é "fora", inverte para casa — isso garante
            // que a tela ao vivo (que sempre mostra meu time à esquerda usando
            // golsCasa/golsFora) fique consistente com o resultado real.
            if (meuConfronto && meuConfronto.casa?.isCPU && meuConfronto.fora && !meuConfronto.fora.isCPU) {
              meuConfronto = { ...meuConfronto, casa: meuConfronto.fora, fora: meuConfronto.casa };
            }
            set({
              grupos: gruposAtualizados,
              fase: "oitavas",
              chave: { oitavas: oitavasFinal, quartas: [], semi: [], final: [] },
              proximoConfronto: meuConfronto,
              mostrarChaveamento: "oitavas",
            });
            return null;
          }

          // próximo adversário CPU ainda não enfrentado por mim, dentro do meu grupo
          const adversariosNoGrupo = grupo.times.filter(t => t.time.isCPU);
          const adv = adversariosNoGrupo[jogosMeu]!.time;
          const res = simularPartida(meu, adv);
          const gruposAtualizados = s.grupos.map((g, gi) => {
            if (gi !== s.meuGrupoIndex) return g;
            const times = g.times.map(t => ({ ...t }));
            const meuRow = times.find(t => !t.time.isCPU)!;
            const advRow = times.find(t => t.time === adv)!;
            aplicarResultado(meuRow, advRow, res.golsCasa, res.golsFora);
            return { ...g, times };
          });
          set({
            grupos: gruposAtualizados,
            historicoJogos: [...s.historicoJogos, {
              fase: `Grupo ${grupo.nome} · Rodada ${jogosMeu + 1}`,
              texto: `${meu.nome} ${res.golsCasa} x ${res.golsFora} ${adv.nome}`,
              resultado: res,
              minhaVitoria: res.golsCasa > res.golsFora,
              empate: res.golsCasa === res.golsFora,
            }],
          });
          return res;
        }

        // ====== MATA-MATA (oitavas, quartas, semi, final) ======
        const fasesOrdem: FaseTorneio[] = ["oitavas", "quartas", "semi", "final"];
        if (fasesOrdem.includes(s.fase) && s.proximoConfronto) {
          // CRÍTICO: garante que MEU TIME é SEMPRE "casa" na simulação,
          // independentemente de como o confronto foi montado na chave.
          // Isso evita o bug de placar invertido (live screen mostra `meu`
          // como casa, mas o simulador estava computando golsCasa pro CPU).
          let casaTime = s.proximoConfronto.casa!;
          let foraTime = s.proximoConfronto.fora!;
          if (casaTime.isCPU && !foraTime.isCPU) {
            const tmp = casaTime; casaTime = foraTime; foraTime = tmp;
          }
          const confrontoNormalizado = { ...s.proximoConfronto, casa: casaTime, fora: foraTime };
          const res = simularPartida(casaTime, foraTime);
          let textoPlacar = `${casaTime.nome} ${res.golsCasa} x ${res.golsFora} ${foraTime.nome}`;
          let vitoriaCasa: boolean;
          let pens: ReturnType<typeof simularPenaltis> | undefined;
          if (res.golsCasa > res.golsFora) vitoriaCasa = true;
          else if (res.golsCasa < res.golsFora) vitoriaCasa = false;
          else {
            pens = simularPenaltis(casaTime, foraTime);
            res.eventos.push({ minuto: 90, tipo: "info", texto: `⚖️ Empate em ${res.golsCasa}x${res.golsFora}. Vai para os pênaltis!` });
            vitoriaCasa = pens.golsCasa > pens.golsFora;
            textoPlacar += ` (${pens.golsCasa}-${pens.golsFora} pen.)`;
          }
          const vencedor = vitoriaCasa ? casaTime : foraTime;
          const minhaVitoria = !vencedor.isCPU;

          const novoHist = [...s.historicoJogos, {
            fase: s.fase.toUpperCase(),
            texto: textoPlacar,
            resultado: res,
            minhaVitoria,
            empate: false, // mata-mata sempre tem vencedor (pênaltis decidem)
            penaltis: pens,
          }];

          // Atualiza a chave APENAS com vencedor/resultado/pênaltis — NÃO sobrescreve
          // casa/fora originais, pois isso fazia o chaveamento visual (final, etc.) embaralhar
          // a ordem que vinha das fases anteriores.
          const chaveAtual = s.chave;
          const fasesArr = chaveAtual[s.fase as "oitavas" | "quartas" | "semi" | "final"];
          const novaFaseArr = fasesArr.map(c =>
            c.id === s.proximoConfronto!.id ? { ...c, resultado: res, penaltis: pens, vencedor } : c,
          );
          const novaChave: ChaveMata = { ...chaveAtual, [s.fase]: novaFaseArr };

          if (!minhaVitoria) {
            set({
              fase: "eliminado",
              historicoJogos: novoHist,
              chave: novaChave,
              proximoConfronto: { ...confrontoNormalizado, resultado: res, penaltis: pens, vencedor },
            });
            return res;
          }
          if (s.fase === "final") {
            set({ fase: "campeao", historicoJogos: novoHist, chave: novaChave });
            return res;
          }

          // Resolve os confrontos restantes da MESMA fase entre CPUs (rápido), para
          // poder montar a fase seguinte com os vencedores corretos.
          const faseArrCompleta = novaFaseArr.map(c => {
            if (c.vencedor || !c.casa || !c.fora) return c;
            if (c.casa.isCPU && c.fora.isCPU) {
              const r = simularPlacarRapido(c.casa, c.fora);
              let venceu = c.casa;
              if (r.golsFora > r.golsCasa) venceu = c.fora;
              else if (r.golsFora === r.golsCasa) {
                const p = simularPenaltis(c.casa, c.fora);
                venceu = p.golsCasa >= p.golsFora ? c.casa : c.fora;
              }
              return { ...c, vencedor: venceu };
            }
            return c;
          });

          const proxFase: FaseTorneio = s.fase === "oitavas" ? "quartas" : s.fase === "quartas" ? "semi" : "final";
          const vencedores = faseArrCompleta.map(c => c.vencedor!).filter(Boolean);
          const novosConfrontos: ConfrontoMata[] = [];
          for (let i = 0; i < vencedores.length; i += 2) {
            novosConfrontos.push(novoConfronto(`${proxFase}-${i / 2 + 1}`, vencedores[i]!, vencedores[i + 1] ?? null));
          }
          let meuProxConfronto = novosConfrontos.find(c => !c.casa?.isCPU || !c.fora?.isCPU) ?? null;
          // Normaliza: meu time sempre como "casa" no próximo confronto.
          if (meuProxConfronto && meuProxConfronto.casa?.isCPU && meuProxConfronto.fora && !meuProxConfronto.fora.isCPU) {
            meuProxConfronto = { ...meuProxConfronto, casa: meuProxConfronto.fora, fora: meuProxConfronto.casa };
          }

          set({
            fase: proxFase,
            historicoJogos: novoHist,
            chave: { ...novaChave, [s.fase]: faseArrCompleta, [proxFase]: novosConfrontos },
            proximoConfronto: meuProxConfronto,
            mostrarChaveamento: proxFase,
          });
          return res;
        }
        return null;
      },

      resetar: () => set(estadoInicial()),

      tentarNovamente: () => {
        // Mantém os MESMOS times CPU (elenco, nome, posição nos grupos) e a MESMA
        // escalação do jogador — apenas zera os resultados das partidas e re-sorteia
        // os jogos do zero. "A sorte pode ser outra", mas os adversários são os mesmos.
        const s = get();
        if (!s.config || !s.grupos.length) return;
        const gruposReiniciados: Grupo[] = s.grupos.map(g => ({
          nome: g.nome,
          times: g.times.map(t => linhaVazia(t.time)),
        }));
        set({
          ...estadoInicial(),
          ativa: true, config: s.config,
          escalacao: s.escalacao,
          nomesJaEscolhidos: s.nomesJaEscolhidos,
          rerollsRestantes: 0, trocasRestantes: 0, slotsRestantes: [],
          fase: "grupos",
          grupos: gruposReiniciados,
          meuGrupoIndex: s.meuGrupoIndex,
          chave: { oitavas: [], quartas: [], semi: [], final: [] },
          proximoConfronto: null,
          historicoJogos: [],
          mostrarApresentacaoGrupos: true,
          mostrarChaveamento: null,
        });
      },
    }),
    {
      name: "campanha-world-cup-draft",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? sessionStorage : ({} as any))),
    }
  )
);
