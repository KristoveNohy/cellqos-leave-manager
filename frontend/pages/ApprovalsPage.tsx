import { useQuery } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import ApprovalInbox from "@/components/approvals/ApprovalInbox";

export default function ApprovalsPage() {
  const backend = useBackend();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pending-requests"],
    queryFn: async () => {
      return backend.leave_requests.list({ status: "PENDING" });
    },
  });
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Schvaľovanie žiadostí</h1>
        <div className="text-sm text-muted-foreground">
          {data?.requests.length || 0} čakajúcich žiadostí
        </div>
      </div>
      
      <ApprovalInbox
        requests={data?.requests || []}
        isLoading={isLoading}
        onUpdate={refetch}
      />
    </div>
  );
}
