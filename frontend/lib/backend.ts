import { useMemo } from "react";
import backend from "~backend/client";
import { useAuth } from "@/lib/auth";

export function useBackend() {
  const { token } = useAuth();

  return useMemo(() => {
    if (!token) return backend;
    return backend.with({
      auth: async () => ({ authorization: `Bearer ${token}` }),
    });
  }, [token]);
}
