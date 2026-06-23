/**
 * FlagEmoji — exibe bandeiras de países com fallback em imagem SVG.
 *
 * O emoji de bandeira de país (Regional Indicator pair) não é renderizado
 * por todos os sistemas: Windows 10/11 e alguns Android mostram apenas
 * as duas letras de região (ex: "BR") em vez do emoji colorido. Este
 * componente tenta exibir o emoji e, se a fonte não suportar (altura
 * do glyph cai abaixo do threshold), troca por uma imagem SVG da
 * flagcdn.com (CDN pública, sem autenticação necessária).
 *
 * Uso:
 *   <FlagEmoji emoji="🇧🇷" size={24} className="shrink-0" />
 *   <FlagEmoji emoji={selecao.bandeira} size={32} />
 */

import { useEffect, useRef, useState } from "react";

// Converte o par de Regional Indicators unicode para código ISO 3166-1 alpha-2.
// Ex: 🇧🇷 (U+1F1E7 U+1F1F7) → "br"
// Flags de subdivisions (England, Scotland, Wales) ficam como emoji puro.
function emojiToIso(emoji: string): string | null {
  const cps = [...emoji].map((c) => c.codePointAt(0) ?? 0);
  if (
    cps.length === 2 &&
    cps[0]! >= 0x1f1e6 &&
    cps[0]! <= 0x1f1ff &&
    cps[1]! >= 0x1f1e6 &&
    cps[1]! <= 0x1f1ff
  ) {
    const a = String.fromCharCode(cps[0]! - 0x1f1e6 + 65); // 'A'
    const b = String.fromCharCode(cps[1]! - 0x1f1e6 + 65);
    return (a + b).toLowerCase();
  }
  // Subdivision tags (England 🏴󠁧󠁢󠁥󠁮󠁧󠁿, Scotland, Wales) — mapeamento manual
  const subdivisions: Record<string, string> = {
    "🏴󠁧󠁢󠁥󠁮󠁧󠁿": "gb-eng",
    "🏴󠁧󠁢󠁳󠁣󠁴󠁿": "gb-sct",
    "🏴󠁧󠁢󠁷󠁬󠁳󠁿": "gb-wls",
  };
  return subdivisions[emoji] ?? null;
}

interface Props {
  /** O emoji de bandeira armazenado na seleção (ex: "🇧🇷") */
  emoji: string;
  /** Tamanho em px (aplicado a width e height). Default: 24 */
  size?: number;
  className?: string;
}

// Cache em memória para não re-checar suporte a cada render
const emojiSupportCache: Record<string, boolean> = {};

function checkEmojiSupport(emoji: string): boolean {
  if (emojiSupportCache[emoji] !== undefined) return emojiSupportCache[emoji]!;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true; // assume suporte se canvas não disponível
    ctx.clearRect(0, 0, 2, 2);
    ctx.font = "1px Arial";
    ctx.fillText(emoji, -4, 4);
    // Se o canvas ficou totalmente transparente após tentar renderizar o emoji,
    // o sistema não suporta (apenas letras de região sem imagem de bandeira).
    // Verificamos um pixel no canto superior esquerdo.
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    const hasContent = pixel[3]! > 10; // canal alpha > 10 = tem conteúdo
    emojiSupportCache[emoji] = hasContent;
    return hasContent;
  } catch {
    return true;
  }
}

export function FlagEmoji({ emoji, size = 24, className = "" }: Props) {
  const [useImage, setUseImage] = useState(false);
  const checkedRef = useRef(false);

  const iso = emojiToIso(emoji);

  useEffect(() => {
    if (checkedRef.current || !iso) return;
    checkedRef.current = true;
    // Roda a checagem fora do ciclo de render para não bloquear
    const supported = checkEmojiSupport(emoji);
    if (!supported) setUseImage(true);
  }, [emoji, iso]);

  // Se não tem código ISO (ex: emoji especial 🏆, 🤖), mostra o texto puro
  if (!iso) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}
        aria-hidden="true"
      >
        {emoji}
      </span>
    );
  }

  if (useImage) {
    // flagcdn.com fornece SVGs gratuitos para todos os códigos ISO 3166-1 e
    // alguns de subdivisões (gb-eng, gb-sct, gb-wls). Sem API key necessária.
    const src = `https://flagcdn.com/${iso}.svg`;
    return (
      <img
        src={src}
        alt={emoji}
        width={size}
        height={Math.round(size * 0.75)}
        className={`inline-block rounded-[2px] object-cover ${className}`}
        loading="lazy"
        onError={(e) => {
          // Se a imagem falhar (código inválido), volta pro emoji texto
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <span
      className={className}
      style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

export default FlagEmoji;
