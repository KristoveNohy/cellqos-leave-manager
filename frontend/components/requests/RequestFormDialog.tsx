import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useBackend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import type { LeaveType } from "~backend/shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";

interface RequestFormDialogProps {
  open: boolean;
  onClose: () => void;
  request?: any;
}

export default function RequestFormDialog({ open, onClose, request }: RequestFormDialogProps) {
  const backend = useBackend();
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER";
  const { toast } = useToast();
  const { register, handleSubmit, setValue, watch, reset } = useForm({
    defaultValues: {
      userId: user?.id ?? "",
      type: request?.type || "ANNUAL_LEAVE",
      startDate: request?.startDate || "",
      endDate: request?.endDate || "",
      isHalfDayStart: request?.isHalfDayStart || false,
      isHalfDayEnd: request?.isHalfDayEnd || false,
      reason: request?.reason || "",
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: async () => backend.users.list(),
    enabled: isManager,
  });

  useEffect(() => {
    reset({
      userId: request?.userId || user?.id || "",
      type: request?.type || "ANNUAL_LEAVE",
      startDate: request?.startDate || "",
      endDate: request?.endDate || "",
      isHalfDayStart: request?.isHalfDayStart || false,
      isHalfDayEnd: request?.isHalfDayEnd || false,
      reason: request?.reason || "",
    });
  }, [request, reset, user?.id]);
  
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return backend.leave_requests.create(data);
    },
    onSuccess: () => {
      toast({ title: "Žiadosť bola úspešne vytvorená" });
      onClose();
    },
    onError: (error: any) => {
      console.error("Failed to create request:", error);
      toast({
        title: "Vytvorenie žiadosti zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return backend.leave_requests.update(data);
    },
    onSuccess: () => {
      toast({ title: "Žiadosť bola úspešne upravená" });
      onClose();
    },
    onError: (error: any) => {
      console.error("Failed to update request:", error);
      toast({
        title: "Úprava žiadosti zlyhala",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (data: any) => {
    const payload = {
      ...data,
      userId: isManager ? data.userId : undefined,
    };

    if (request) {
      const { userId: _userId, ...rest } = payload;
      updateMutation.mutate({ id: request.id, ...rest });
      return;
    }

    createMutation.mutate(payload);
  };

  const users = usersData?.users || [];
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {request ? "Upraviť žiadosť o voľno" : "Nová žiadosť o voľno"}
          </DialogTitle>
          <DialogDescription>
            {request
              ? "Upravte detaily žiadosti podľa potreby."
              : "Vyplňte detaily žiadosti a odošlite ju na schválenie."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {isManager && !request && (
            <div>
              <Label>Žiadateľ</Label>
              <Select
                value={watch("userId")}
                onValueChange={(value) => setValue("userId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Vyberte používateľa" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((entry: any) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name} ({entry.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Typ</Label>
            <Select
              value={watch("type")}
              onValueChange={(value) => setValue("type", value as LeaveType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ANNUAL_LEAVE">Dovolenka</SelectItem>
                <SelectItem value="SICK_LEAVE">PN</SelectItem>
                <SelectItem value="HOME_OFFICE">Home office</SelectItem>
                <SelectItem value="UNPAID_LEAVE">Neplatené voľno</SelectItem>
                <SelectItem value="OTHER">Iné</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Začiatok</Label>
              <Input type="date" {...register("startDate")} required />
            </div>
            <div>
              <Label>Koniec</Label>
              <Input type="date" {...register("endDate")} required />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="halfDayStart"
                checked={watch("isHalfDayStart")}
                onCheckedChange={(checked) => setValue("isHalfDayStart", checked as boolean)}
              />
              <Label htmlFor="halfDayStart" className="font-normal">
                Poldeň (začiatok)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="halfDayEnd"
                checked={watch("isHalfDayEnd")}
                onCheckedChange={(checked) => setValue("isHalfDayEnd", checked as boolean)}
              />
              <Label htmlFor="halfDayEnd" className="font-normal">
                Poldeň (koniec)
              </Label>
            </div>
          </div>
          
          <div>
            <Label>Dôvod (nepovinné)</Label>
            <Textarea {...register("reason")} rows={3} />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Zrušiť
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Ukladá sa..." : "Uložiť ako návrh"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
