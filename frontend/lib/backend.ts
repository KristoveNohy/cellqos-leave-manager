import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { createApiClient } from "@/lib/apiClient";

export function useBackend() {
  const { token } = useAuth();

  return useMemo(() => {
    return createApiClient(token);
  }, [token]);
}
