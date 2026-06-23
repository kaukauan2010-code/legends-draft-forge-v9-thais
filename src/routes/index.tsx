import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    const visitante = typeof window !== "undefined" && localStorage.getItem("wcd_visitante") === "1";
    navigate({ to: user || visitante ? "/dashboard" : "/auth", replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="grid min-h-screen place-items-center">
      <div className="font-display text-4xl italic tracking-tight text-primary animate-pulse">WCD</div>
    </div>
  );
}
