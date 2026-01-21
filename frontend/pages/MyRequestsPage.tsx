import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import backend from "~backend/client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import RequestsList from "@/components/requests/RequestsList";
import RequestFormDialog from "@/components/requests/RequestFormDialog";

export default function MyRequestsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // TODO: Replace with actual user ID from Clerk
  const userId = "user_manager_placeholder";
  
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-requests"],
    queryFn: async () => {
      return backend.leave_requests.list({ userId });
    },
  });
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Moje žiadosti o voľno</h1>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nová žiadosť
        </Button>
      </div>
      
      <RequestsList
        requests={data?.requests || []}
        isLoading={isLoading}
        onUpdate={refetch}
      />
      
      {showCreateDialog && (
        <RequestFormDialog
          open={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
