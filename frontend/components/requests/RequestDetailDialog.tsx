import { useMutation } from "@tanstack/react-query";
import backend from "~backend/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Calendar, User, Clock } from "lucide-react";

interface RequestDetailDialogProps {
  request: any;
  open: boolean;
  onClose: () => void;
}

export default function RequestDetailDialog({ request, open, onClose }: RequestDetailDialogProps) {
  const { toast } = useToast();
  
  const submitMutation = useMutation({
    mutationFn: async () => {
      return backend.leave_requests.submit({ id: request.id });
    },
    onSuccess: () => {
      toast({ title: "Request submitted for approval" });
      onClose();
    },
    onError: (error: any) => {
      console.error("Failed to submit request:", error);
      toast({
        title: "Failed to submit request",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const cancelMutation = useMutation({
    mutationFn: async () => {
      return backend.leave_requests.cancel({ id: request.id });
    },
    onSuccess: () => {
      toast({ title: "Request cancelled" });
      onClose();
    },
    onError: (error: any) => {
      console.error("Failed to cancel request:", error);
      toast({
        title: "Failed to cancel request",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
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
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Leave Request Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Type</div>
              <div className="font-medium">{typeLabels[request.type as keyof typeof typeLabels]}</div>
            </div>
            <Badge className={statusColors[request.status as keyof typeof statusColors]}>
              {request.status}
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Start Date</div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{request.startDate}</span>
                {request.isHalfDayStart && (
                  <Badge variant="outline" className="text-xs">Half day</Badge>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">End Date</div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{request.endDate}</span>
                {request.isHalfDayEnd && (
                  <Badge variant="outline" className="text-xs">Half day</Badge>
                )}
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-sm text-muted-foreground mb-1">Duration</div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{request.computedDays} working days</span>
            </div>
          </div>
          
          {request.reason && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Reason</div>
              <div className="p-3 bg-muted rounded-md">{request.reason}</div>
            </div>
          )}
          
          {request.managerComment && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Manager Comment</div>
              <div className="p-3 bg-muted rounded-md">{request.managerComment}</div>
            </div>
          )}
          
          <div className="flex justify-end space-x-2">
            {request.status === "DRAFT" && (
              <Button onClick={() => submitMutation.mutate()}>
                Submit for Approval
              </Button>
            )}
            {(request.status === "DRAFT" || request.status === "PENDING") && (
              <Button variant="destructive" onClick={() => cancelMutation.mutate()}>
                Cancel Request
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
