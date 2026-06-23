import type { Posicao } from "./selecoes";

export type FormacaoId =
  | "4-3-3" | "4-4-2" | "3-5-2" | "4-2-3-1" | "5-3-2"
  | "5-4-1" | "3-4-3" | "4-5-1" | "4-4-1-1" | "4-2-4";

export interface SlotPosicional {
  id: string;
  posicao: Posicao;   // posição EXATA exigida (regra de quem pode ocupar o slot)
  x: number;          // 0-100
  y: number;          // 0-100 (0 = ataque, 100 = goleiro)
  label: string;      // rótulo exibido no campo (GOL, ZAG, LD, LE, VOL, MEI, CA, PD, PE)
}

export interface Formacao {
  id: FormacaoId;
  nome: string;
  slots: SlotPosicional[];
}

// Convenção do eixo Y: 0 = linha de ataque (frente do gol adversário), 100 = baliza própria.
// Faixas de referência usadas para posicionar com fidelidade tática:
//   y≈8-15   → linha de ataque (CA, ATA/pontas)
//   y≈28-36  → meia-ofensivo / meia-atacante (MEI avançado, armador)
//   y≈44-50  → meio-campo central (MEI/MC recuado, organizador)
//   y≈54-60  → volante (entre a zaga e o meio, sempre o mais recuado dos meio-campistas)
//   y≈68-74  → laterais/alas (DEF, abertos nas pontas, levemente adiantados em relação à zaga)
//   y≈76-82  → zaga central
//   y≈92     → goleiro
export const FORMACOES: Record<FormacaoId, Formacao> = {
  // 4-3-3: GOL, 2 ZAG, LD, LE, 1 VOL, 2 MEI (meio-campo), CA, 2 ATA (pontas)
  "4-3-3": {
    id: "4-3-3", nome: "4-3-3",
    slots: [
      { id: "ponta-e", posicao: "ATA", x: 16, y: 14, label: "PE" },
      { id: "ca",      posicao: "CA",  x: 50, y: 9,  label: "CA" },
      { id: "ponta-d", posicao: "ATA", x: 84, y: 14, label: "PD" },
      { id: "mei-e",   posicao: "MEI", x: 30, y: 42, label: "MEI" },
      { id: "mei-d",   posicao: "MEI", x: 70, y: 42, label: "MEI" },
      { id: "vol",     posicao: "VOL", x: 50, y: 58, label: "VOL" },
      { id: "le",      posicao: "LE",  x: 10, y: 70, label: "LE" },
      { id: "zag-1",   posicao: "ZAG", x: 34, y: 80, label: "ZAG" },
      { id: "zag-2",   posicao: "ZAG", x: 66, y: 80, label: "ZAG" },
      { id: "ld",      posicao: "LD",  x: 90, y: 70, label: "LD" },
      { id: "gol",     posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 4-4-2: GOL, 2 ZAG, LD, LE, 2 VOL, MD, ME, 2 CA
  "4-4-2": {
    id: "4-4-2", nome: "4-4-2",
    slots: [
      { id: "ca-1",  posicao: "CA",  x: 38, y: 10, label: "CA" },
      { id: "ca-2",  posicao: "CA",  x: 62, y: 10, label: "CA" },
      { id: "me",    posicao: "MEI", x: 14, y: 44, label: "MEI" },
      { id: "vol-1", posicao: "VOL", x: 38, y: 54, label: "VOL" },
      { id: "vol-2", posicao: "VOL", x: 62, y: 54, label: "VOL" },
      { id: "md",    posicao: "MEI", x: 86, y: 44, label: "MEI" },
      { id: "le",    posicao: "LE",  x: 10, y: 72, label: "LE" },
      { id: "zag-1", posicao: "ZAG", x: 34, y: 80, label: "ZAG" },
      { id: "zag-2", posicao: "ZAG", x: 66, y: 80, label: "ZAG" },
      { id: "ld",    posicao: "LD",  x: 90, y: 72, label: "LD" },
      { id: "gol",   posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 3-5-2: GOL, 3 ZAG, Ala-D, Ala-E (LD/LE jogando alto), 2 VOL, 1 Armador (MEI), 2 CA
  "3-5-2": {
    id: "3-5-2", nome: "3-5-2",
    slots: [
      { id: "ca-1",  posicao: "CA",  x: 38, y: 10, label: "CA" },
      { id: "ca-2",  posicao: "CA",  x: 62, y: 10, label: "CA" },
      { id: "armador", posicao: "MEI", x: 50, y: 32, label: "MEI" },
      { id: "ala-e", posicao: "LE",  x: 8,  y: 48, label: "MEI" },
      { id: "vol-1", posicao: "VOL", x: 38, y: 58, label: "VOL" },
      { id: "vol-2", posicao: "VOL", x: 62, y: 58, label: "VOL" },
      { id: "ala-d", posicao: "LD",  x: 92, y: 48, label: "MEI" },
      { id: "zag-1", posicao: "ZAG", x: 24, y: 80, label: "ZAG" },
      { id: "zag-2", posicao: "ZAG", x: 50, y: 84, label: "ZAG" },
      { id: "zag-3", posicao: "ZAG", x: 76, y: 80, label: "ZAG" },
      { id: "gol",   posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 4-2-3-1: GOL, 2 ZAG, LD, LE, 2 VOL, 1 meia-atacante central, MD/PD, ME/PE, 1 CA
  "4-2-3-1": {
    id: "4-2-3-1", nome: "4-2-3-1",
    slots: [
      { id: "ca",      posicao: "CA",  x: 50, y: 9,  label: "CA" },
      { id: "me-pe",   posicao: "MEI", x: 18, y: 30, label: "MEI" },
      { id: "mei-c",   posicao: "MEI", x: 50, y: 28, label: "MEI" },
      { id: "md-pd",   posicao: "MEI", x: 82, y: 30, label: "MEI" },
      { id: "vol-1",   posicao: "VOL", x: 38, y: 56, label: "VOL" },
      { id: "vol-2",   posicao: "VOL", x: 62, y: 56, label: "VOL" },
      { id: "le",      posicao: "LE",  x: 10, y: 72, label: "LE" },
      { id: "zag-1",   posicao: "ZAG", x: 34, y: 80, label: "ZAG" },
      { id: "zag-2",   posicao: "ZAG", x: 66, y: 80, label: "ZAG" },
      { id: "ld",      posicao: "LD",  x: 90, y: 72, label: "LD" },
      { id: "gol",     posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 5-3-2: GOL, 3 ZAG (líbero implícito no central), LD, LE, 1 VOL, 2 MEI, 2 CA
  "5-3-2": {
    id: "5-3-2", nome: "5-3-2",
    slots: [
      { id: "ca-1",  posicao: "CA",  x: 38, y: 10, label: "CA" },
      { id: "ca-2",  posicao: "CA",  x: 62, y: 10, label: "CA" },
      { id: "mei-e", posicao: "MEI", x: 30, y: 40, label: "MEI" },
      { id: "mei-d", posicao: "MEI", x: 70, y: 40, label: "MEI" },
      { id: "vol",   posicao: "VOL", x: 50, y: 56, label: "VOL" },
      { id: "le",    posicao: "LE",  x: 8,  y: 68, label: "LE" },
      { id: "zag-1", posicao: "ZAG", x: 28, y: 80, label: "ZAG" },
      { id: "zag-2", posicao: "ZAG", x: 50, y: 84, label: "ZAG" },
      { id: "zag-3", posicao: "ZAG", x: 72, y: 80, label: "ZAG" },
      { id: "ld",    posicao: "LD",  x: 92, y: 68, label: "LD" },
      { id: "gol",   posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 5-4-1: GOL, 3 ZAG, LD, LE, 2 VOL, MD, ME, 1 CA
  "5-4-1": {
    id: "5-4-1", nome: "5-4-1",
    slots: [
      { id: "ca",    posicao: "CA",  x: 50, y: 10, label: "CA" },
      { id: "me",    posicao: "MEI", x: 16, y: 42, label: "MEI" },
      { id: "vol-1", posicao: "VOL", x: 38, y: 56, label: "VOL" },
      { id: "vol-2", posicao: "VOL", x: 62, y: 56, label: "VOL" },
      { id: "md",    posicao: "MEI", x: 84, y: 42, label: "MEI" },
      { id: "le",    posicao: "LE",  x: 8,  y: 68, label: "LE" },
      { id: "zag-1", posicao: "ZAG", x: 28, y: 80, label: "ZAG" },
      { id: "zag-2", posicao: "ZAG", x: 50, y: 84, label: "ZAG" },
      { id: "zag-3", posicao: "ZAG", x: 72, y: 80, label: "ZAG" },
      { id: "ld",    posicao: "LD",  x: 92, y: 68, label: "LD" },
      { id: "gol",   posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 3-4-3: GOL, 3 ZAG, 2 MEI (centrais), Ala-D, Ala-E, CA, 2 ATA (pontas)
  "3-4-3": {
    id: "3-4-3", nome: "3-4-3",
    slots: [
      { id: "ponta-e", posicao: "ATA", x: 16, y: 14, label: "PE" },
      { id: "ca",      posicao: "CA",  x: 50, y: 9,  label: "CA" },
      { id: "ponta-d", posicao: "ATA", x: 84, y: 14, label: "PD" },
      { id: "ala-e",   posicao: "LE",  x: 8,  y: 46, label: "MEI" },
      { id: "mei-1",   posicao: "MEI", x: 34, y: 50, label: "MEI" },
      { id: "mei-2",   posicao: "MEI", x: 66, y: 50, label: "MEI" },
      { id: "ala-d",   posicao: "LD",  x: 92, y: 46, label: "MEI" },
      { id: "zag-1",   posicao: "ZAG", x: 24, y: 80, label: "ZAG" },
      { id: "zag-2",   posicao: "ZAG", x: 50, y: 84, label: "ZAG" },
      { id: "zag-3",   posicao: "ZAG", x: 76, y: 80, label: "ZAG" },
      { id: "gol",     posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 4-5-1: GOL, 2 ZAG, LD, LE, 3 VOL/MEI, MD, ME, 1 CA
  "4-5-1": {
    id: "4-5-1", nome: "4-5-1",
    slots: [
      { id: "ca",    posicao: "CA",  x: 50, y: 10, label: "CA" },
      { id: "me",    posicao: "MEI", x: 12, y: 40, label: "MEI" },
      { id: "mei-c", posicao: "MEI", x: 50, y: 38, label: "MEI" },
      { id: "md",    posicao: "MEI", x: 88, y: 40, label: "MEI" },
      { id: "vol-1", posicao: "VOL", x: 34, y: 58, label: "VOL" },
      { id: "vol-2", posicao: "VOL", x: 66, y: 58, label: "VOL" },
      { id: "le",    posicao: "LE",  x: 10, y: 72, label: "LE" },
      { id: "zag-1", posicao: "ZAG", x: 34, y: 80, label: "ZAG" },
      { id: "zag-2", posicao: "ZAG", x: 66, y: 80, label: "ZAG" },
      { id: "ld",    posicao: "LD",  x: 90, y: 72, label: "LD" },
      { id: "gol",   posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 4-4-1-1: GOL, 2 ZAG, LD, LE, 2 VOL, MD, ME, 1 Segundo Atacante, 1 CA
  "4-4-1-1": {
    id: "4-4-1-1", nome: "4-4-1-1",
    slots: [
      { id: "ca",     posicao: "CA",  x: 50, y: 9,  label: "CA" },
      { id: "seg-ata",posicao: "MEI", x: 50, y: 26, label: "CA" },
      { id: "me",     posicao: "MEI", x: 14, y: 44, label: "MEI" },
      { id: "md",     posicao: "MEI", x: 86, y: 44, label: "MEI" },
      { id: "vol-1",  posicao: "VOL", x: 38, y: 56, label: "VOL" },
      { id: "vol-2",  posicao: "VOL", x: 62, y: 56, label: "VOL" },
      { id: "le",     posicao: "LE",  x: 10, y: 72, label: "LE" },
      { id: "zag-1",  posicao: "ZAG", x: 34, y: 80, label: "ZAG" },
      { id: "zag-2",  posicao: "ZAG", x: 66, y: 80, label: "ZAG" },
      { id: "ld",     posicao: "LD",  x: 90, y: 72, label: "LD" },
      { id: "gol",    posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
  // 4-2-4: GOL, 2 ZAG, LD, LE, 2 MEI (centrais), 2 CA, 2 ATA (pontas)
  "4-2-4": {
    id: "4-2-4", nome: "4-2-4",
    slots: [
      { id: "ponta-e", posicao: "ATA", x: 14, y: 14, label: "PE" },
      { id: "ca-1",    posicao: "CA",  x: 40, y: 9,  label: "CA" },
      { id: "ca-2",    posicao: "CA",  x: 60, y: 9,  label: "CA" },
      { id: "ponta-d", posicao: "ATA", x: 86, y: 14, label: "PD" },
      { id: "mei-1",   posicao: "MEI", x: 34, y: 50, label: "MEI" },
      { id: "mei-2",   posicao: "MEI", x: 66, y: 50, label: "MEI" },
      { id: "le",      posicao: "LE",  x: 10, y: 72, label: "LE" },
      { id: "zag-1",   posicao: "ZAG", x: 34, y: 80, label: "ZAG" },
      { id: "zag-2",   posicao: "ZAG", x: 66, y: 80, label: "ZAG" },
      { id: "ld",      posicao: "LD",  x: 90, y: 72, label: "LD" },
      { id: "gol",     posicao: "GOL", x: 50, y: 93, label: "GOL" },
    ],
  },
};

export const LISTA_FORMACOES: Formacao[] = Object.values(FORMACOES);
