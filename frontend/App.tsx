import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import Navigation from "./components/layout/Navigation";
import CalendarPage from "./pages/CalendarPage";
import MyRequestsPage from "./pages/MyRequestsPage";
import TeamPage from "./pages/TeamPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import AdminPage from "./pages/AdminPage";

const PUBLISHABLE_KEY = "pk_test_aW4tZGFuZS01My5jbGVyay5hY2NvdW50cy5kZXYk";

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
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <Navigation />
            <main className="container mx-auto py-6 px-4">
              <Routes>
                <Route path="/" element={<Navigate to="/calendar" replace />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/my-requests" element={<MyRequestsPage />} />
                <Route path="/team" element={<TeamPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Routes>
            </main>
            <Toaster />
          </div>
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
