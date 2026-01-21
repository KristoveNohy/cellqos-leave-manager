import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useBackend } from "@/lib/backend";
import type { LeaveType } from "~backend/shared/types";
import {
  Dialog,
  DialogContent,
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
  const { toast } = useToast();
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      type: request?.type || "ANNUAL_LEAVE",
      startDate: request?.startDate || "",
      endDate: request?.endDate || "",
      isHalfDayStart: request?.isHalfDayStart || false,
      isHalfDayEnd: request?.isHalfDayEnd || false,
      reason: request?.reason || "",
    },
  });
  
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
  
  const onSubmit = (data: any) => {
    createMutation.mutate(data);
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {request ? "Upraviť žiadosť o voľno" : "Nová žiadosť o voľno"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Typ</Label>
            <Select
              defaultValue={watch("type")}
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
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Ukladá sa..." : "Uložiť ako návrh"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
