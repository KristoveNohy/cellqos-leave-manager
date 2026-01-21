import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import RequestDetailDialog from "./RequestDetailDialog";

interface RequestsListProps {
  requests: any[];
  isLoading: boolean;
  onUpdate: () => void;
  showUser?: boolean;
}

export default function RequestsList({ requests, isLoading, onUpdate, showUser }: RequestsListProps) {
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  
  const statusColors = {
    DRAFT: "bg-gray-500",
    PENDING: "bg-yellow-500",
    APPROVED: "bg-green-500",
    REJECTED: "bg-red-500",
    CANCELLED: "bg-gray-400",
  };
  
  const typeLabels = {
    ANNUAL_LEAVE: "Annual Leave",
    SICK_LEAVE: "Sick Leave",
    HOME_OFFICE: "Home Office",
    UNPAID_LEAVE: "Unpaid Leave",
    OTHER: "Other",
  };
  
  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }
  
  if (requests.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">No requests found</p>
      </Card>
    );
  }
  
  return (
    <>
      <div className="space-y-4">
        {requests.map((request) => (
          <Card key={request.id} className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center space-x-3">
                  <h3 className="font-semibold">
                    {typeLabels[request.type as keyof typeof typeLabels]}
                  </h3>
                  <Badge className={statusColors[request.status as keyof typeof statusColors]}>
                    {request.status}
                  </Badge>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {request.startDate} to {request.endDate} ({request.computedDays} days)
                </div>
                
                {request.reason && (
                  <div className="text-sm text-muted-foreground italic">
                    {request.reason}
                  </div>
                )}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRequest(request)}
              >
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
            </div>
          </Card>
        ))}
      </div>
      
      {selectedRequest && (
        <RequestDetailDialog
          request={selectedRequest}
          open={!!selectedRequest}
          onClose={() => {
            setSelectedRequest(null);
            onUpdate();
          }}
        />
      )}
    </>
  );
}
