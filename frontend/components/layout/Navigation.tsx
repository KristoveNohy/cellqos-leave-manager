import { Link, useLocation } from "react-router-dom";
import { Calendar, FileText, Users, CheckSquare, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function Navigation() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const userRole = user?.role ?? "EMPLOYEE";
  
  const navItems = [
    { path: "/calendar", label: "Kalendár", icon: Calendar, roles: ["EMPLOYEE", "MANAGER"] },
    { path: "/my-requests", label: "Moje žiadosti", icon: FileText, roles: ["EMPLOYEE", "MANAGER"] },
    { path: "/team", label: "Tím", icon: Users, roles: ["MANAGER"] },
    { path: "/approvals", label: "Schvaľovanie", icon: CheckSquare, roles: ["MANAGER"] },
    { path: "/admin", label: "Administrácia", icon: Settings, roles: ["MANAGER"] },
  ];
  
  const visibleItems = user ? navItems.filter(item => item.roles.includes(userRole)) : [];
  
  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2">
              <Calendar className="h-6 w-6 text-primary" />
              <span className="font-semibold text-lg">CellQos Správa dovoleniek</span>
            </Link>
            
            <div className="flex space-x-1">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="text-sm text-muted-foreground">
                  {user.name} ({user.role === "MANAGER" ? "Manažér" : "Zamestnanec"})
                </div>
                <Button variant="outline" size="sm" onClick={logout}>
                  Odhlásiť
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link to="/login">Prihlásiť</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
