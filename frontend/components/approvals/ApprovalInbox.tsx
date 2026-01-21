import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import backend from "~backend/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Check, X } from "lucide-react";

interface ApprovalInboxProps {
  requests: any[];
  isLoading: boolean;
  onUpdate: () => void;
}

export default function ApprovalInbox({ requests, isLoading, onUpdate }: ApprovalInboxProps) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      return backend.leave_requests.approve({ id, comment });
    },
    onSuccess: () => {
      toast({ title: "Request approved" });
      setComment("");
      setExpandedId(null);
      onUpdate();
    },
    onError: (error: any) => {
      console.error("Failed to approve request:", error);
      toast({
        title: "Failed to approve request",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!comment) {
        throw new Error("Comment is required for rejection");
      }
      return backend.leave_requests.reject({ id, comment });
    },
    onSuccess: () => {
      toast({ title: "Request rejected" });
      setComment("");
      setExpandedId(null);
      onUpdate();
    },
    onError: (error: any) => {
      console.error("Failed to reject request:", error);
      toast({
        title: "Failed to reject request",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
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
        <p className="text-muted-foreground">No pending requests</p>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.id} className="p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center space-x-3">
                  <h3 className="font-semibold">
                    {typeLabels[request.type as keyof typeof typeLabels]}
                  </h3>
                  <Badge className="bg-yellow-500">PENDING</Badge>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {request.startDate} to {request.endDate} ({request.computedDays} days)
                </div>
                
                {request.reason && (
                  <div className="text-sm text-muted-foreground italic">
                    Reason: {request.reason}
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 border-green-600 hover:bg-green-50"
                  onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-600 hover:bg-red-50"
                  onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
            
            {expandedId === request.id && (
              <div className="space-y-3 pt-4 border-t">
                <Textarea
                  placeholder="Add a comment (optional for approval, required for rejection)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExpandedId(null);
                      setComment("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => approveMutation.mutate(request.id)}
                    disabled={approveMutation.isPending}
                  >
                    Confirm Approval
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => rejectMutation.mutate(request.id)}
                    disabled={rejectMutation.isPending || !comment}
                  >
                    Confirm Rejection
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
