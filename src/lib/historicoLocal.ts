const LIMITE_CAMPANHAS_LOCAIS = 6;

function chave(userId: string) {
  return `wcd-historico-campanhas-${userId}`;
}

export function lerCampanhasLocais(userId?: string | null): any[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(chave(userId));
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function mesclarCampanhas(...listas: any[][]): any[] {
  const map = new Map<string, any>();
  listas.flat().forEach((campanha) => {
    if (!campanha?.id) return;
    const atual = map.get(campanha.id);
    if (!atual || ((campanha.log?.length ?? 0) >= (atual.log?.length ?? 0))) {
      map.set(campanha.id, { ...atual, ...campanha });
    }
  });
  return [...map.values()].sort((a, b) =>
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}

export function salvarCampanhaLocal(userId: string | undefined | null, campanha: any) {
  if (!userId || !campanha?.id || typeof window === "undefined") return;
  const existentes = lerCampanhasLocais(userId);
  const anterior = existentes.find((c) => c.id === campanha.id);
  const atualizada = {
    ...anterior,
    ...campanha,
    created_at: anterior?.created_at ?? campanha.created_at ?? new Date().toISOString(),
  };
  const proximas = mesclarCampanhas([atualizada], existentes.filter((c) => c.id !== campanha.id))
    .slice(0, LIMITE_CAMPANHAS_LOCAIS);
  localStorage.setItem(chave(userId), JSON.stringify(proximas));
}