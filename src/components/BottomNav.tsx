import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Swords, Trophy, User, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/jogar", label: "Jogar", icon: Swords },
  { to: "/historico", label: "Histórico", icon: Trophy },
  { to: "/conquistas", label: "Conquistas", icon: Medal },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const path = useRouterState({ select: s => s.location.pathname });
  return (
    <nav className="fixed bottom-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-border bg-black/60 p-2 backdrop-blur-xl">
      <div className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[8px] font-black uppercase tracking-widest transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shadow-[0_0_15px_var(--color-primary)]">
                  <Icon className="size-5" />
                </div>
              ) : (
                <Icon className="size-5" />
              )}
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
