import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const visitante = typeof window !== "undefined" && localStorage.getItem("wcd_visitante") === "1";

  useEffect(() => {
    if (!loading && !user && !visitante) navigate({ to: "/auth", replace: true });
  }, [user, loading, visitante, navigate]);

  if (loading || (!user && !visitante)) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Carregando...</div>;
  }
  return (
    <div className="min-h-screen pb-28">
      {!user && visitante && (
        <div className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2">
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-widest text-primary">Modo Visitante</div>
              <div className="truncate text-[10px] text-muted-foreground">Faça login para salvar progresso, conquistas e jogar online.</div>
            </div>
            <Link
              to="/auth"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary-foreground shadow"
            >
              <LogIn className="size-3.5" /> Entrar
            </Link>
          </div>
        </div>
      )}
      <Outlet />
      <BottomNav />
    </div>
  );
}
