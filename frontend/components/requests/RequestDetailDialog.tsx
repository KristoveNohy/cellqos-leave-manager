import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import { formatLeaveHours } from "@/lib/leaveFormat";
import { formatRequestDateTime } from "@/lib/requestDateTime";
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
import RequestFormDialog from "./RequestFormDialog";

type AuditLogEntry = {
  id: number;
  actorUserId: string;
  actorName?: string | null;
  action: string;
  beforeJson: any;
  afterJson: any;
  createdAt: string;
};

interface RequestDetailDialogProps {
  request: any;
  open: boolean;
  onClose: () => void;
}

export default function RequestDetailDialog({ request, open, onClose }: RequestDetailDialogProps) {
  const backend = useBackend();
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const startDateLabel = formatRequestDateTime(request.startDate, request.startTime);
  const endDateLabel = formatRequestDateTime(request.endDate, request.endTime);
  const startTimeLabel = request.startTime ? request.startTime.slice(0, 5) : null;
  const endTimeLabel = request.endTime ? request.endTime.slice(0, 5) : null;
  const timeRangeLabel =
    startTimeLabel && endTimeLabel
      ? `${startTimeLabel} – ${endTimeLabel}`
      : startTimeLabel || endTimeLabel;
  
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return backend.leave_requests.remove({ id: request.id });
    },
    onSuccess: () => {
      toast({ title: "Žiadosť bola odstránená" });
      onClose();
    },
    onError: (error: any) => {
      console.error("Failed to delete request:", error);
      toast({
        title: "Odstránenie žiadosti zlyhalo",
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

  const actionLabels: Record<string, string> = {
    CREATE: "Vytvorená",
    UPDATE: "Upravená",
    SUBMIT: "Odoslaná",
    APPROVE: "Schválená",
    REJECT: "Zamietnutá",
    CANCEL: "Zrušená",
    DELETE: "Odstránená",
    BULK_APPROVE: "Hromadné schválenie",
    BULK_REJECT: "Hromadné zamietnutie",
  };

  const canViewHistory = Boolean(user?.role === "MANAGER" || user?.role === "ADMIN" || request.userId === user?.id);

  const historyQuery = useQuery({
    queryKey: ["audit", request.id],
    enabled: open && canViewHistory,
    queryFn: async () => {
      const response = await backend.audit.list({
        entityType: "leave_request",
        entityId: String(request.id),
      });
      return response.logs as AuditLogEntry[];
    },
  });

  const sortedHistory = useMemo(() => {
    if (!historyQuery.data) {
      return [];
    }
    return [...historyQuery.data].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [historyQuery.data]);

  const formatHistoryEntry = (entry: AuditLogEntry) => {
    const before = entry.beforeJson ?? {};
    const after = entry.afterJson ?? {};
    const startDate = formatRequestDateTime(after.startDate ?? before.startDate, after.startTime ?? before.startTime);
    const endDate = formatRequestDateTime(after.endDate ?? before.endDate, after.endTime ?? before.endTime);
    const beforeStatus = before.status;
    const afterStatus = after.status;
    const statusChange =
      beforeStatus && afterStatus && beforeStatus !== afterStatus
        ? `${statusLabels[beforeStatus as keyof typeof statusLabels] ?? beforeStatus} → ${
            statusLabels[afterStatus as keyof typeof statusLabels] ?? afterStatus
          }`
        : afterStatus
          ? statusLabels[afterStatus as keyof typeof statusLabels] ?? afterStatus
          : null;

    const pieces = [
      statusChange ? `Stav: ${statusChange}` : null,
      startDate && endDate ? `Obdobie: ${startDate} – ${endDate}` : null,
    ].filter(Boolean);

    return pieces.length > 0 ? pieces.join(" • ") : "Bez detailu zmeny";
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detail žiadosti o voľno</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">Typ</div>
              <div className="font-medium">{typeLabels[request.type as keyof typeof typeLabels]}</div>
            </div>
            <Badge
              className={`${statusColors[request.status as keyof typeof statusColors]} px-3 py-1 text-xs shrink-0`}
            >
              {statusLabels[request.status as keyof typeof statusLabels] ?? request.status}
            </Badge>
          </div>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Začiatok</div>
              <div className="flex flex-wrap items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="break-all">{startDateLabel}</span>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Koniec</div>
              <div className="flex flex-wrap items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="break-all">{endDateLabel}</span>
              </div>
            </div>
          </div>

          {timeRangeLabel && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Čas</div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{timeRangeLabel}</span>
              </div>
            </div>
          )}
          
          <div>
            <div className="text-sm text-muted-foreground mb-1">Trvanie</div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatLeaveHours(request.computedHours)}</span>
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

          {canViewHistory && (
            <div>
              <div className="text-sm text-muted-foreground mb-2">History</div>
              {historyQuery.isLoading && (
                <div className="text-sm text-muted-foreground">Načítavam históriu...</div>
              )}
              {historyQuery.isError && (
                <div className="text-sm text-destructive">Históriu sa nepodarilo načítať.</div>
              )}
              {!historyQuery.isLoading && !historyQuery.isError && sortedHistory.length === 0 && (
                <div className="text-sm text-muted-foreground">Žiadna história.</div>
              )}
              {!historyQuery.isLoading && !historyQuery.isError && sortedHistory.length > 0 && (
                <ul className="space-y-3">
                  {sortedHistory.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-start gap-3">
                      <Badge variant="outline">
                        {actionLabels[entry.action] ?? entry.action}
                      </Badge>
                      <div className="space-y-1 min-w-0">
                        <div className="text-sm">
                          {new Date(entry.createdAt).toLocaleString("sk-SK")}
                          {" • "}
                          {entry.actorName ?? entry.actorUserId}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatHistoryEntry(entry)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          
          <div className="flex flex-wrap justify-end gap-2">
            {isManager && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowEditDialog(true)}>
                  Upraviť
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm("Naozaj chcete odstrániť túto žiadosť?")) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  Odstrániť
                </Button>
              </>
            )}
            {request.status === "DRAFT" && (
              <Button size="sm" className="font-semibold" onClick={() => submitMutation.mutate()}>
                Odoslať na schválenie
              </Button>
            )}
            {(request.status === "DRAFT" || request.status === "PENDING") && (
              <Button size="sm" variant="destructive" onClick={() => cancelMutation.mutate()}>
                Zrušiť žiadosť
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
      {showEditDialog && (
        <RequestFormDialog
          open={showEditDialog}
          request={request}
          onClose={() => {
            setShowEditDialog(false);
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}
