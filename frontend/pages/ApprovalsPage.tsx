import { useQuery } from "@tanstack/react-query";
import backend from "~backend/client";
import { Card } from "@/components/ui/card";
import ApprovalInbox from "@/components/approvals/ApprovalInbox";

export default function ApprovalsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pending-requests"],
    queryFn: async () => {
      return backend.leave_requests.list({ status: "PENDING" });
    },
  });
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Approval Inbox</h1>
        <div className="text-sm text-muted-foreground">
          {data?.requests.length || 0} pending requests
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
