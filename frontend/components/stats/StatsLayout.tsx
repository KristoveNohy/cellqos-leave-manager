import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface StatsLayoutProps {
  title: string;
  breadcrumb: string;
  subtitle?: string;
  children: ReactNode;
}

export default function StatsLayout({ title, breadcrumb, subtitle, children }: StatsLayoutProps) {
  const location = useLocation();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">Štatistiky / {breadcrumb}</p>
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </header>
      <nav className="flex flex-wrap gap-2 text-sm stats-no-print">
        {[
          { path: "/stats", label: "Dashboard" },
          { path: "/stats/calendar", label: "Kalendár" },
          { path: "/stats/export", label: "Export" },
        ].map((item) => {
          const active =
            location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
