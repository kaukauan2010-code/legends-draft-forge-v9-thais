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
  const [erro, setErro] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [confSenha, setConfSenha] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // O Supabase v2 usa o hash para enviar o token de recovery.
    // O evento PASSWORD_RECOVERY é disparado quando detecta o hash correto.
    const hash = window.location.hash;
    const hasRecoveryHash = hash.includes("type=recovery") || hash.includes("access_token");

    if (!hasRecoveryHash) {
      // Sem hash de recovery: se já existir sessão (ex: usuário caiu aqui
      // depois de logar com Google), NÃO mostra o formulário — manda direto
      // pro dashboard. Sem isso, o login social parece "abrir redefinir senha".
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          navigate({ to: "/dashboard", replace: true });
        } else {
          setErro("Link de recuperação inválido ou expirado. Solicite um novo link.");
        }
      });
    }

    // Escuta o evento de recovery do Supabase
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setPronto(true);
        setErro(null);
      } else if (event === "SIGNED_IN" && session && !hasRecoveryHash) {
        // Login normal (não recovery) — sai daqui.
        navigate({ to: "/dashboard", replace: true });
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 6) return toast.error("Senha precisa ter pelo menos 6 caracteres");
    if (novaSenha !== confSenha) return toast.error("As senhas não coincidem");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha redefinida com sucesso! Faça login com sua nova senha.");
    // Faz logout para forçar novo login limpo com a nova senha
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

        {erro ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{erro}</p>
            <Link
              to="/auth"
              className="block w-full text-center rounded-lg bg-primary text-primary-foreground py-2 font-bold text-sm uppercase tracking-widest"
            >
              Solicitar novo link
            </Link>
          </div>
        ) : !pronto ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">Validando link de recuperação...</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Aguarde enquanto processamos seu link. Se demorar mais de 10 segundos,{" "}
              <Link to="/auth" className="underline text-primary">solicite um novo link</Link>.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="np">Nova senha</Label>
              <Input
                id="np"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp">Confirmar nova senha</Label>
              <Input
                id="cp"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
                value={confSenha}
                onChange={e => setConfSenha(e.target.value)}
                placeholder="Repita a senha"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 font-bold uppercase tracking-widest"
            >
              {busy ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}

        <Link
          to="/auth"
          className="block text-center text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary underline mt-4"
        >
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
