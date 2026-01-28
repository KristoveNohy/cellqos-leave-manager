import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Calendar, FileText, Users, CheckSquare, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useBackend } from "@/lib/backend";

export default function Navigation() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const backend = useBackend();
  const userRole = user?.role ?? "EMPLOYEE";
  
  const navItems = [
    { path: "/calendar", label: "Kalendár", icon: Calendar, roles: ["EMPLOYEE", "MANAGER", "ADMIN"] },
    { path: "/my-requests", label: "Moje žiadosti", icon: FileText, roles: ["EMPLOYEE", "MANAGER", "ADMIN"] },
    { path: "/notifications", label: "Notifikácie", icon: Bell, roles: ["EMPLOYEE", "MANAGER", "ADMIN"] },
    { path: "/team", label: "Tím", icon: Users, roles: ["MANAGER", "ADMIN"] },
    { path: "/approvals", label: "Schvaľovanie", icon: CheckSquare, roles: ["MANAGER", "ADMIN"] },
    { path: "/admin", label: "Administrácia", icon: Settings, roles: ["ADMIN"] },
  ];

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await backend.notifications.list();
      return response.notifications;
    },
  });

  const unreadCount = notificationsQuery.data?.filter((notification) => !notification.readAt).length ?? 0;
  
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
                    {item.path === "/notifications" && unreadCount > 0 && (
                      <Badge variant="secondary" className="ml-1 px-2 py-0 text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <Link
                  to="/profile"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {user.name} (
                  {user.role === "ADMIN" ? "Admin" : user.role === "MANAGER" ? "Manažér" : "Zamestnanec"})
                </Link>
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
