import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type HolidayFormValues = {
  date: string;
  name: string;
  isCompanyHoliday: boolean;
};

export default function HolidayManagement() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<any | null>(null);
  
  const { data, isLoading } = useQuery({
    queryKey: ["holidays", currentYear],
    queryFn: async () => backend.holidays.list({ year: currentYear }),
  });
  const { register, handleSubmit, setValue, watch, reset } = useForm<HolidayFormValues>({
    defaultValues: {
      date: "",
      name: "",
      isCompanyHoliday: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { date: string; name: string; isCompanyHoliday: boolean }) =>
      backend.holidays.create(payload),
    onSuccess: () => {
      toast({ title: "Sviatok bol pridaný." });
      queryClient.invalidateQueries({ queryKey: ["holidays", currentYear] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Pridanie sviatku zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: number } & Record<string, unknown>) =>
      backend.holidays.update(payload),
    onSuccess: () => {
      toast({ title: "Sviatok bol upravený." });
      queryClient.invalidateQueries({ queryKey: ["holidays", currentYear] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Úprava sviatku zlyhala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: { id: number }) => backend.holidays.remove(payload),
    onSuccess: () => {
      toast({ title: "Sviatok bol odstránený." });
      queryClient.invalidateQueries({ queryKey: ["holidays", currentYear] });
    },
    onError: (error: any) => {
      toast({
        title: "Odstránenie sviatku zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  if (isLoading) {
    return <div className="text-center py-12">Načítava sa...</div>;
  }
  
  const holidays = data?.holidays || [];

  const openCreate = () => {
    setEditingHoliday(null);
    reset({ date: "", name: "", isCompanyHoliday: true });
    setDialogOpen(true);
  };

  const openEdit = (holiday: any) => {
    setEditingHoliday(holiday);
    reset({
      date: holiday.date ?? "",
      name: holiday.name ?? "",
      isCompanyHoliday: Boolean(holiday.isCompanyHoliday),
    });
    setDialogOpen(true);
  };

  const handleDelete = (holiday: any) => {
    const confirmed = window.confirm(`Naozaj chcete odstrániť sviatok ${holiday.name}?`);
    if (confirmed) {
      deleteMutation.mutate({ id: holiday.id });
    }
  };

  const onSubmit = (values: HolidayFormValues) => {
    const payload = {
      date: values.date,
      name: values.name.trim(),
      isCompanyHoliday: values.isCompanyHoliday,
    };

    if (editingHoliday) {
      updateMutation.mutate({ id: editingHoliday.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };
  
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Sviatky</h2>
          <p className="text-sm text-muted-foreground">
            Spravujte firemné aj voliteľné sviatky.
          </p>
        </div>
        <Button onClick={openCreate}>Pridať sviatok</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dátum</TableHead>
            <TableHead>Názov</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead className="text-right">Akcie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holidays.map((holiday) => (
            <TableRow key={holiday.id}>
              <TableCell className="font-medium">{holiday.date}</TableCell>
              <TableCell>{holiday.name}</TableCell>
              <TableCell>
                <Badge variant={holiday.isCompanyHoliday ? "default" : "secondary"}>
                  {holiday.isCompanyHoliday ? "Firemný" : "Voliteľný"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(holiday)}>
                    Upraviť
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(holiday)}
                    disabled={deleteMutation.isPending}
                  >
                    Odstrániť
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingHoliday ? "Upraviť sviatok" : "Pridať sviatok"}
            </DialogTitle>
            <DialogDescription>
              Zadajte dátum a názov sviatku, prípadne označte firemný typ.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="holiday-date">Dátum</Label>
                <Input id="holiday-date" type="date" {...register("date", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="holiday-name">Názov</Label>
                <Input id="holiday-name" {...register("name", { required: true })} />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="holiday-company"
                checked={watch("isCompanyHoliday")}
                onCheckedChange={(checked) => setValue("isCompanyHoliday", checked as boolean)}
              />
              <Label htmlFor="holiday-company" className="font-normal">
                Firemný sviatok
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Zrušiť
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? "Ukladá sa..." : "Uložiť"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
