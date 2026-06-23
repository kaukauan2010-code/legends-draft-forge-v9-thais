// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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

function Jogar() {
  const navigate = useNavigate();
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
    <div className="mx-auto max-w-md px-4 py-6 space-y-6 animate-enter">
      <header>
        <h1 className="font-display text-3xl uppercase italic tracking-tight">Configurar Partida</h1>
        <p className="text-sm text-muted-foreground">Defina como sua campanha vai começar.</p>
      </header>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display uppercase tracking-tight text-lg">Formação Tática</h2>
          <span className="text-[10px] uppercase tracking-widest text-primary">{formacaoId}</span>
        </div>
        <MiniCampo formacao={FORMACOES[formacaoId]} escalacao={[]} />
        <div className="grid grid-cols-3 gap-2">
          {LISTA_FORMACOES.map(f => (
            <button
              key={f.id}
              onClick={() => setFormacaoId(f.id)}
              className={cn(
                "rounded-lg border py-3 font-display font-bold uppercase tracking-widest text-xs transition-all",
                formacaoId === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {f.nome}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display uppercase tracking-tight text-lg">Estratégia</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["defensiva", "equilibrada", "ofensiva"] as Estrategia[]).map(e => (
            <button
              key={e}
              onClick={() => setEstrategia(e)}
              className={cn(
                "rounded-lg border py-3 font-bold uppercase text-[10px] tracking-widest",
                estrategia === e ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display uppercase tracking-tight text-lg">Modo de Jogo</h2>
        <button
          onClick={() => setModo("classico")}
          className={cn(
            "w-full rounded-xl border p-4 text-left transition-all",
            modo === "classico" ? "border-primary bg-primary/10" : "border-border bg-card",
          )}
        >
          <div className="font-display uppercase font-bold tracking-tight">Clássico</div>
          <p className="text-xs text-muted-foreground mt-1">Forças visíveis. 3 rerolls e 3 trocas por campanha.</p>
        </button>
        <button
          onClick={() => setModo("almanaque")}
          className={cn(
            "w-full rounded-xl border p-4 text-left transition-all",
            modo === "almanaque" ? "border-legendary bg-legendary/10" : "border-border bg-card",
          )}
        >
          <div className="font-display uppercase font-bold tracking-tight text-legendary">Almanaque</div>
          <p className="text-xs text-muted-foreground mt-1">Forças escondidas. 1 reroll e 1 troca. Para quem manja.</p>
        </button>
      </section>

      <section className="space-y-1.5">
        <Label>Nome do seu time</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Lendas FC" />
      </section>

      <Button onClick={comecar} className="w-full h-12 font-display uppercase italic tracking-widest text-base font-black">
        Começar Draft
      </Button>
    </div>
  );
}
