// @ts-nocheck
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCampanha, type Modo } from "@/lib/campanha";
import { LISTA_FORMACOES, type FormacaoId } from "@/lib/formacoes";
import { MiniCampo } from "@/components/MiniCampo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Estrategia } from "@/lib/simulador";
import { FORMACOES } from "@/lib/formacoes";

export const Route = createFileRoute("/_app/jogar")({
  head: () => ({ meta: [{ title: "Configurar partida — World Cup Draft" }] }),
  component: Jogar,
});

// Hook auxiliar: se há campanha em andamento, redireciona para a tela apropriada
// (draft se escalação incompleta, torneio se já entrou na fase de torneio).
// Sem isso, sair pra /conquistas e clicar de novo em "Jogar" wipea a partida.
function useRedirectSeCampanhaEmAndamento(navigate: ReturnType<typeof useNavigate>) {
  useEffect(() => {
    const checar = () => {
      const st = useCampanha.getState();
      if (!st.ativa || !st.config) return;
      if (st.fase === "campeao" || st.fase === "eliminado") return;
      if (st.escalacao.length < 11) navigate({ to: "/draft", replace: true });
      else navigate({ to: "/torneio", replace: true });
    };
    if (useCampanha.persist.hasHydrated()) { checar(); return; }
    const unsub = useCampanha.persist.onFinishHydration(checar);
    return () => unsub();
  }, [navigate]);
}

function Jogar() {
  const navigate = useNavigate();
  useRedirectSeCampanhaEmAndamento(navigate);
  const iniciar = useCampanha(s => s.iniciar);
  const [formacaoId, setFormacaoId] = useState<FormacaoId>("4-3-3");
  const [estrategia, setEstrategia] = useState<Estrategia>("equilibrada");
  const [modo, setModo] = useState<Modo>("classico");
  const [nome, setNome] = useState("");

  const comecar = () => {
    iniciar({ formacaoId, estrategia, modo, nomeTime: nome.trim() || "Meu Time" });
    navigate({ to: "/draft" });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-4 space-y-4 animate-enter">
      <header>
        <Link
          to="/dashboard"
          onClick={() => useCampanha.getState().resetar()}
          className="mb-3 inline-flex w-full items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-destructive"
        >
          Voltar ao início
        </Link>
        <h1 className="font-display text-2xl uppercase italic tracking-tight">Configurar Partida</h1>
        <p className="text-xs text-muted-foreground">Defina como sua campanha vai começar.</p>
      </header>

      {/* Formação + campo: campo é o protagonista, lista de formações compacta */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display uppercase tracking-tight text-sm font-bold">Formação Tática</h2>
          <span className="text-[10px] uppercase tracking-widest text-primary font-bold">{formacaoId}</span>
        </div>
        <div className="space-y-2">
          {/* Campo maior, ocupando largura toda */}
          <div className="mx-auto w-full max-w-[260px]">
            <div className="w-full" style={{ aspectRatio: "3/4" }}>
              <MiniCampo formacao={FORMACOES[formacaoId]} escalacao={[]} fill />
            </div>
          </div>
          {/* Lista compacta — 3 colunas, botões enxutos */}
          <div className="grid grid-cols-3 gap-1">
            {LISTA_FORMACOES.map(f => (
              <button
                key={f.id}
                onClick={() => setFormacaoId(f.id)}
                className={cn(
                  "rounded-md border py-1 font-display font-bold uppercase tracking-tight text-[10px] transition-all",
                  formacaoId === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
                )}
              >
                {f.id}
              </button>
            ))}
          </div>
        </div>
      </section>


      <section className="space-y-1.5">
        <h2 className="font-display uppercase tracking-tight text-sm font-bold">Estratégia</h2>
        <div className="grid grid-cols-3 gap-1.5">
          {(["defensiva", "equilibrada", "ofensiva"] as Estrategia[]).map(e => (
            <button
              key={e}
              onClick={() => setEstrategia(e)}
              className={cn(
                "rounded-md border py-2 font-bold uppercase text-[9px] tracking-widest",
                estrategia === e ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-1.5">
        <h2 className="font-display uppercase tracking-tight text-sm font-bold">Modo de Jogo</h2>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setModo("classico")}
            className={cn(
              "rounded-lg border p-3 text-left transition-all",
              modo === "classico" ? "border-primary bg-primary/10" : "border-border bg-card",
            )}
          >
            <div className="font-display uppercase font-bold tracking-tight text-xs">Clássico</div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Forças visíveis. 3 rerolls e 3 trocas.</p>
          </button>
          <button
            onClick={() => setModo("almanaque")}
            className={cn(
              "rounded-lg border p-3 text-left transition-all",
              modo === "almanaque" ? "border-legendary bg-legendary/10" : "border-border bg-card",
            )}
          >
            <div className="font-display uppercase font-bold tracking-tight text-xs text-legendary">Almanaque</div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Forças ocultas. 1 reroll e 1 troca.</p>
          </button>
        </div>
      </section>

      <section className="space-y-1">
        <Label className="text-xs">Nome do seu time</Label>
        <Input
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Ex: Lendas FC"
          className="h-9 text-sm"
        />
      </section>

      <Button onClick={comecar} className="w-full h-11 font-display uppercase italic tracking-widest text-base font-black">
        Começar Draft
      </Button>
    </div>
  );
}
