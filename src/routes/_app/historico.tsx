import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PartidaHistoricoCard, partidasDeCampanhas } from "@/components/CampanhaCard";
import { lerCampanhasLocais, mesclarCampanhas } from "@/lib/historicoLocal";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/historico")({
  head: () => ({ meta: [{ title: "Histórico — World Cup Draft" }] }),
  component: Historico,
});

function Historico() {
  const { user } = useAuth();
  const { data: partidas } = useQuery({
    queryKey: ["historico", user?.id],
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => (await supabase.from("partidas").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(10)).data ?? [],
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 space-y-4 text-center">
        <h1 className="font-display text-3xl uppercase italic tracking-tight">Histórico</h1>
        <p className="text-sm text-muted-foreground">
          O histórico das suas campanhas fica guardado na sua conta. Faça login para vê-lo aqui.
        </p>
        <Button asChild className="w-full h-11 font-bold uppercase tracking-widest">
          <Link to="/auth"><LogIn className="size-4 mr-1.5" /> Fazer login</Link>
        </Button>
      </div>
    );
  }

  const campanhas = mesclarCampanhas(partidas ?? [], lerCampanhasLocais(user?.id));
  const ultimasPartidas = partidasDeCampanhas(campanhas, 80);

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-4">
      <h1 className="font-display text-3xl uppercase italic tracking-tight">Histórico</h1>
      <p className="text-xs text-muted-foreground -mt-2">Últimos campeonatos com placar, fase (grupos, oitavas, quartas, semi, final) e lance a lance.</p>
      {!ultimasPartidas.length && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
          Nenhuma partida salva ainda. Comece a jogar!
        </div>
      )}
      {ultimasPartidas.map(item => (
        <PartidaHistoricoCard key={item.id} item={item} />
      ))}
    </div>
  );
}
