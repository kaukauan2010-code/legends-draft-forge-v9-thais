import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Upload, Sun, Moon, KeyRound, LogIn } from "lucide-react";
import { AmigosSection } from "@/components/AmigosSection";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({ meta: [{ title: "Perfil — World Cup Draft" }] }),
  component: Perfil,
});

function Perfil() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });

  const [nome, setNome] = useState("");
  const [avatar, setAvatar] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confSenha, setConfSenha] = useState("");

  useEffect(() => {
    if (profile) { setNome(profile.display_name); setAvatar(profile.avatar_url ?? ""); }
  }, [profile]);

  const isEmailAccount = user?.app_metadata?.provider === "email" ||
    user?.identities?.some(i => i.provider === "email");

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({
        display_name: nome, avatar_url: avatar || null,
      }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Perfil salvo"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const trocarSenha = useMutation({
    mutationFn: async () => {
      if (novaSenha.length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres");
      if (novaSenha !== confSenha) throw new Error("As senhas não coincidem");
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Senha atualizada"); setNovaSenha(""); setConfSenha(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const uploadFoto = async (file: File) => {
    if (!user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande (máx 2MB)"); return; }
    setEnviando(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: urlErr } = await supabase.storage.from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (urlErr) throw urlErr;
      setAvatar(signed.signedUrl);
      toast.success("Foto carregada — não esqueça de salvar");
    } catch (e: any) {
      toast.error(e.message ?? "Falha no upload");
    } finally { setEnviando(false); }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center space-y-4">
        <h1 className="font-display text-3xl uppercase italic">Modo Visitante</h1>
        <p className="text-sm text-muted-foreground">Crie uma conta ou faça login para personalizar seu perfil.</p>
        <Button asChild className="w-full h-11 font-bold uppercase tracking-widest">
          <Link to="/auth"><LogIn className="size-4 mr-1.5" /> Fazer login</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl uppercase italic tracking-tight">Perfil</h1>
        <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="size-4 mr-1" /> Sair</Button>
      </header>

      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative group" disabled={enviando}>
          {avatar ? (
            <img src={avatar} alt="" className="size-28 rounded-full border-4 border-primary object-cover" />
          ) : (
            <div className="grid size-28 place-items-center rounded-full border-4 border-primary bg-card font-display text-4xl">
              {nome[0]?.toUpperCase() ?? "T"}
            </div>
          )}
          <div className="absolute inset-0 grid place-items-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
            <Upload className="size-6 text-white" />
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFoto(f); }} />
        <Button variant="outline" size="sm" disabled={enviando} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4 mr-1.5" /> {enviando ? "Enviando..." : "Trocar foto"}
        </Button>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>

      <form onSubmit={e => { e.preventDefault(); salvar.mutate(); }} className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label>Nome de exibição</Label>
          <Input value={nome} onChange={e => setNome(e.target.value)} required />
        </div>
        <Button type="submit" disabled={salvar.isPending} className="w-full h-11 font-bold uppercase tracking-widest">
          {salvar.isPending ? "Salvando..." : "Salvar perfil"}
        </Button>
      </form>

      {profile?.player_id && <AmigosSection meuId={user.id} meuPlayerId={profile.player_id} />}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Aparência</div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")} className="font-bold">
            <Moon className="size-4 mr-1.5" /> Escuro
          </Button>
          <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")} className="font-bold">
            <Sun className="size-4 mr-1.5" /> Claro
          </Button>
        </div>
      </div>

      {isEmailAccount && (
        <form onSubmit={e => { e.preventDefault(); trocarSenha.mutate(); }} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <KeyRound className="size-3.5" /> Alterar senha
          </div>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input type="password" minLength={6} value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar nova senha</Label>
            <Input type="password" minLength={6} value={confSenha} onChange={e => setConfSenha(e.target.value)} required />
          </div>
          <Button type="submit" disabled={trocarSenha.isPending} className="w-full h-11 font-bold uppercase tracking-widest">
            {trocarSenha.isPending ? "Atualizando..." : "Atualizar senha"}
          </Button>
        </form>
      )}
    </div>
  );
}
