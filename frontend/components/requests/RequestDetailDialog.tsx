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
import { Calendar, Clock } from "lucide-react";

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
      toast({ title: "Žiadosť bola odoslaná na schválenie" });
      onClose();
    },
    onError: (error: any) => {
      console.error("Failed to submit request:", error);
      toast({
        title: "Odoslanie žiadosti zlyhalo",
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
      toast({ title: "Žiadosť bola zrušená" });
      onClose();
    },
    onError: (error: any) => {
      console.error("Failed to cancel request:", error);
      toast({
        title: "Zrušenie žiadosti zlyhalo",
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

  const statusLabels = {
    DRAFT: "Návrh",
    PENDING: "Čaká",
    APPROVED: "Schválené",
    REJECTED: "Zamietnuté",
    CANCELLED: "Zrušené",
  };
  
  const typeLabels = {
    ANNUAL_LEAVE: "Dovolenka",
    SICK_LEAVE: "PN",
    HOME_OFFICE: "Home office",
    UNPAID_LEAVE: "Neplatené voľno",
    OTHER: "Iné",
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detail žiadosti o voľno</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Typ</div>
              <div className="font-medium">{typeLabels[request.type as keyof typeof typeLabels]}</div>
            </div>
            <Badge className={statusColors[request.status as keyof typeof statusColors]}>
              {statusLabels[request.status as keyof typeof statusLabels] ?? request.status}
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Začiatok</div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{request.startDate}</span>
                {request.isHalfDayStart && (
                  <Badge variant="outline" className="text-xs">Poldeň</Badge>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Koniec</div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{request.endDate}</span>
                {request.isHalfDayEnd && (
                  <Badge variant="outline" className="text-xs">Poldeň</Badge>
                )}
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-sm text-muted-foreground mb-1">Trvanie</div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{request.computedDays} pracovných dní</span>
            </div>
          </div>
          
          {request.reason && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Dôvod</div>
              <div className="p-3 bg-muted rounded-md">{request.reason}</div>
            </div>
          )}
          
          {request.managerComment && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Komentár manažéra</div>
              <div className="p-3 bg-muted rounded-md">{request.managerComment}</div>
            </div>
          )}
          
          <div className="flex justify-end space-x-2">
            {request.status === "DRAFT" && (
              <Button onClick={() => submitMutation.mutate()}>
                Odoslať na schválenie
              </Button>
            )}
            {(request.status === "DRAFT" || request.status === "PENDING") && (
              <Button variant="destructive" onClick={() => cancelMutation.mutate()}>
                Zrušiť žiadosť
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Zavrieť
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
