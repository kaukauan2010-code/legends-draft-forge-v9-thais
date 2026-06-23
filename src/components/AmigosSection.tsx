import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  buscarJogadorPorId, enviarSolicitacaoAmizade, listarAmizades, aceitarSolicitacao,
  removerAmizade, buscarResumoAmigo, buscarHistoricoConfronto,
  type PerfilPublico, type AmizadeComPerfil,
} from "@/lib/amigos";
import { Search, UserPlus, Check, X, Users, Copy, Trophy, Swords, Flame, Medal, ChevronLeft } from "lucide-react";

export function AmigosSection({ meuId, meuPlayerId }: { meuId: string; meuPlayerId: string }) {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<PerfilPublico | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [amigoAberto, setAmigoAberto] = useState<AmizadeComPerfil | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["amizades", meuId],
    queryFn: () => listarAmizades(meuId),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`amizades-${meuId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "amizades", filter: `user_id=eq.${meuId}` },
        () => qc.invalidateQueries({ queryKey: ["amizades", meuId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "amizades", filter: `amigo_id=eq.${meuId}` },
        () => qc.invalidateQueries({ queryKey: ["amizades", meuId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [meuId, qc]);

  const buscar = async () => {
    setBuscando(true);
    setResultado(null);
    try {
      const r = await buscarJogadorPorId(codigo);
      if (!r) toast.error("Nenhum jogador com esse Id.");
      setResultado(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  const solicitar = async (alvo: PerfilPublico) => {
    setEnviando(true);
    try {
      await enviarSolicitacaoAmizade(meuId, alvo.id);
      toast.success(`Solicitação enviada para ${alvo.display_name}`);
      setResultado(null);
      setCodigo("");
      qc.invalidateQueries({ queryKey: ["amizades", meuId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const aceitar = async (id: string) => {
    try {
      await aceitarSolicitacao(id);
      toast.success("Agora vocês são amigos!");
      qc.invalidateQueries({ queryKey: ["amizades", meuId] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const remover = async (id: string, msg: string) => {
    try {
      await removerAmizade(id);
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["amizades", meuId] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const copiarMeuId = async () => {
    await navigator.clipboard.writeText(meuPlayerId);
    toast.success("Id copiado");
  };

  if (amigoAberto) {
    return (
      <DashboardAmigo meuId={meuId} amigo={amigoAberto} onVoltar={() => setAmigoAberto(null)}
        onDesfeito={() => { setAmigoAberto(null); qc.invalidateQueries({ queryKey: ["amizades", meuId] }); }} />
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Users className="size-3.5" /> Amigos
        </div>
        <button onClick={copiarMeuId} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary">
          Seu Id: <span className="font-bold tabular-nums text-foreground">{meuPlayerId}</span> <Copy className="size-3" />
        </button>
      </div>

      <div className="space-y-2">
        <Label>Adicionar por Id Jogador</Label>
        <div className="flex gap-2">
          <Input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11 números" inputMode="numeric" maxLength={11} />
          <Button onClick={buscar} disabled={buscando || codigo.length !== 11}><Search className="size-4" /></Button>
        </div>
        {resultado && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar perfil={resultado} />
              <span className="font-bold text-sm truncate">{resultado.display_name}</span>
            </div>
            <Button size="sm" disabled={enviando} onClick={() => solicitar(resultado)}>
              <UserPlus className="size-4 mr-1" /> Adicionar
            </Button>
          </div>
        )}
      </div>

      {!!data?.recebidas.length && (
        <div className="space-y-2">
          <Label>Solicitações recebidas</Label>
          {data.recebidas.map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar perfil={a.perfil} />
                <span className="font-bold text-sm truncate">{a.perfil.display_name}</span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="size-8 p-0" onClick={() => remover(a.id, "Solicitação recusada")}><X className="size-4" /></Button>
                <Button size="sm" className="size-8 p-0" onClick={() => aceitar(a.id)}><Check className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!!data?.enviadas.length && (
        <div className="space-y-2">
          <Label>Solicitações enviadas</Label>
          {data.enviadas.map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/60 p-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar perfil={a.perfil} />
                <span className="truncate">{a.perfil.display_name}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remover(a.id, "Solicitação cancelada")}>Cancelar</Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label>Meus amigos {data?.aceitas.length ? `(${data.aceitas.length})` : ""}</Label>
        {isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
        {!isLoading && !data?.aceitas.length && <p className="text-xs text-muted-foreground">Você ainda não tem amigos adicionados.</p>}
        {data?.aceitas.map(a => (
          <button key={a.id} onClick={() => setAmigoAberto(a)}
            className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary p-2.5 hover:bg-secondary/70">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar perfil={a.perfil} />
              <span className="font-bold text-sm truncate">{a.perfil.display_name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">ver perfil</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardAmigo({ meuId, amigo, onVoltar, onDesfeito }: {
  meuId: string; amigo: AmizadeComPerfil; onVoltar: () => void; onDesfeito: () => void;
}) {
  const { data: resumo, isLoading } = useQuery({
    queryKey: ["resumo-amigo", amigo.perfil.id],
    queryFn: () => buscarResumoAmigo(amigo.perfil.id),
  });
  const { data: historico } = useQuery({
    queryKey: ["historico-confronto", meuId, amigo.perfil.id],
    queryFn: () => buscarHistoricoConfronto(meuId, amigo.perfil.id),
  });

  const desfazer = async () => {
    try {
      await removerAmizade(amigo.id);
      toast.success("Amizade desfeita");
      onDesfeito();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4 animate-enter">
      <button onClick={onVoltar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Voltar pros amigos
      </button>

      {isLoading || !resumo ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar perfil={resumo.perfil} size="lg" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold uppercase tracking-wider truncate">{resumo.perfil.display_name}</h2>
              <p className="text-[10px] text-muted-foreground">Id {resumo.perfil.player_id}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MiniStat icon={<Swords className="size-3.5" />} label="Partidas" value={resumo.partidas} />
            <MiniStat icon={<Flame className="size-3.5" />} label="Vitórias" value={resumo.vitorias} />
            <MiniStat icon={<Trophy className="size-3.5" />} label="Mundiais" value={resumo.titulos} />
            <MiniStat icon={<Medal className="size-3.5" />} label="Conquistas" value={resumo.conquistas} />
          </div>

          <div className="rounded-xl border border-border bg-secondary/50 p-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Confronto direto (online)</p>
            {!historico || historico.partidas === 0 ? (
              <p className="text-xs text-muted-foreground">Vocês ainda não se enfrentaram no online.</p>
            ) : (
              <div className="flex justify-between text-sm font-bold">
                <span>{historico.partidas} jogos</span>
                <span className="text-primary">{historico.vitorias}V</span>
                <span className="text-destructive">{historico.derrotas}D</span>
                <span className="text-muted-foreground">{historico.empates}E</span>
              </div>
            )}
          </div>

          <button onClick={desfazer} className="text-[10px] text-destructive underline">Desfazer amizade</button>
        </>
      )}
    </div>
  );
}

function Avatar({ perfil, size = "sm" }: { perfil: PerfilPublico; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "size-14 text-xl" : "size-8 text-xs";
  return perfil.avatar_url ? (
    <img src={perfil.avatar_url} alt="" className={`${cls} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${cls} rounded-full bg-primary/20 grid place-items-center font-display font-black text-primary shrink-0`}>
      {perfil.display_name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-2.5">
      <div className="text-primary">{icon}</div>
      <div>
        <div className="font-display text-lg font-black leading-none">{value}</div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
