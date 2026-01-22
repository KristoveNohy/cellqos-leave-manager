import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Navigation from "./components/layout/Navigation";
import CalendarPage from "./pages/CalendarPage";
import MyRequestsPage from "./pages/MyRequestsPage";
import TeamPage from "./pages/TeamPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import MagicLinkPage from "./pages/MagicLinkPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";
import { AuthProvider, useAuth } from "@/lib/auth";
import type { UserRole } from "~backend/shared/types";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Navigation />
            <main className="container mx-auto py-6 px-4">
              <Routes>
                <Route path="/" element={<Navigate to="/calendar" replace />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/magic-link" element={<MagicLinkPage />} />
                <Route
                  path="/calendar"
                  element={
                    <RequireAuth>
                      <CalendarPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/my-requests"
                  element={
                    <RequireAuth>
                      <MyRequestsPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/team"
                  element={
                    <RequireRole role="MANAGER">
                      <TeamPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/approvals"
                  element={
                    <RequireRole role="MANAGER">
                      <ApprovalsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <RequireAuth>
                      <NotificationsPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <RequireAuth>
                      <ProfilePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RequireRole role="MANAGER">
                      <AdminPage />
                    </RequireRole>
                  }
                />
              </Routes>
            </main>
            <Toaster />
          </div>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequireRole({ children, role }: { children: JSX.Element; role: UserRole }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role) {
    return <Navigate to="/calendar" replace />;
  }
  return children;
}
