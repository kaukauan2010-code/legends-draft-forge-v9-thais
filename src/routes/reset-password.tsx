import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Redefinir senha — World Cup Draft" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confSenha, setConfSenha] = useState("");
  const [busy, setBusy] = useState(false);

  // O Supabase coloca o token de recovery no hash (#access_token=...&type=recovery).
  // O cliente JS detecta automaticamente e cria a sessão; basta esperar.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setPronto(true);
    });
    // Caso a sessão já exista (refresh da tela)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 6) return toast.error("Senha precisa ter pelo menos 6 caracteres");
    if (novaSenha !== confSenha) return toast.error("As senhas não coincidem");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha redefinida! Agora você pode entrar.");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen px-4 py-10 flex flex-col">
      <Link to="/" className="self-center mb-8 font-display text-4xl italic font-black tracking-tighter text-primary">
        WORLD CUP DRAFT
      </Link>
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-6 animate-enter">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="size-5 text-primary" />
          <h1 className="font-display text-2xl uppercase italic tracking-tight">Redefinir senha</h1>
        </div>
        {!pronto ? (
          <p className="text-sm text-muted-foreground">
            Validando o link de recuperação... Se não carregar, peça um novo link na tela de login.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="np">Nova senha</Label>
              <Input id="np" type="password" autoComplete="new-password" minLength={6} required value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp">Confirmar nova senha</Label>
              <Input id="cp" type="password" autoComplete="new-password" minLength={6} required value={confSenha} onChange={e => setConfSenha(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full h-11 font-bold uppercase tracking-widest">
              {busy ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
        <Link to="/auth" className="block text-center text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary underline mt-4">
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
