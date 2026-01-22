import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type UserFormValues = {
  name: string;
  email: string;
  role: "EMPLOYEE" | "MANAGER";
  teamId: string;
  employmentStartDate: string;
  birthDate: string;
  hasChild: boolean;
  manualLeaveAllowanceDays: string;
};

export default function UserManagement() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => backend.users.list(),
  });
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => backend.teams.list(),
  });
  const { register, handleSubmit, setValue, watch, reset } = useForm<UserFormValues>({
    defaultValues: {
      name: "",
      email: "",
      role: "EMPLOYEE",
      teamId: "none",
      employmentStartDate: "",
      birthDate: "",
      hasChild: false,
      manualLeaveAllowanceDays: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      email: string;
      name: string;
      role: string;
      teamId?: number | null;
      birthDate?: string | null;
      hasChild?: boolean;
      employmentStartDate?: string | null;
      manualLeaveAllowanceDays?: number | null;
    }) =>
      backend.users.create(payload),
    onSuccess: () => {
      toast({ title: "Používateľ bol vytvorený." });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Vytvorenie používateľa zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string } & Record<string, unknown>) =>
      backend.users.update(payload),
    onSuccess: () => {
      toast({ title: "Používateľ bol upravený." });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Úprava používateľa zlyhala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: { id: string }) => backend.users.remove(payload),
    onSuccess: () => {
      toast({ title: "Používateľ bol odstránený." });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Odstránenie používateľa zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  if (isLoading) {
    return <div className="text-center py-12">Načítava sa...</div>;
  }
  
  const users = data?.users || [];
  const teams = teamsData?.teams || [];
  const roleLabels = {
    MANAGER: "Manažér",
    EMPLOYEE: "Zamestnanec",
  };

  const openCreate = () => {
    setEditingUser(null);
    reset({
      name: "",
      email: "",
      role: "EMPLOYEE",
      teamId: "none",
      employmentStartDate: "",
      birthDate: "",
      hasChild: false,
      manualLeaveAllowanceDays: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (user: any) => {
    setEditingUser(user);
    reset({
      name: user.name ?? "",
      email: user.email ?? "",
      role: user.role ?? "EMPLOYEE",
      teamId: user.teamId ? String(user.teamId) : "none",
      employmentStartDate: user.employmentStartDate ? String(user.employmentStartDate).slice(0, 10) : "",
      birthDate: user.birthDate ? String(user.birthDate).slice(0, 10) : "",
      hasChild: Boolean(user.hasChild),
      manualLeaveAllowanceDays: user.manualLeaveAllowanceDays !== null && user.manualLeaveAllowanceDays !== undefined
        ? String(user.manualLeaveAllowanceDays)
        : "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (user: any) => {
    const confirmed = window.confirm(`Naozaj chcete odstrániť používateľa ${user.name}?`);
    if (confirmed) {
      deleteMutation.mutate({ id: user.id });
    }
  };

  const onSubmit = (values: UserFormValues) => {
    const payload = {
      email: values.email.trim(),
      name: values.name.trim(),
      role: values.role,
      teamId: values.teamId !== "none" ? Number(values.teamId) : null,
      employmentStartDate: values.employmentStartDate ? values.employmentStartDate : null,
      birthDate: values.birthDate ? values.birthDate : null,
      hasChild: values.hasChild,
      manualLeaveAllowanceDays: values.manualLeaveAllowanceDays
        ? Number(values.manualLeaveAllowanceDays)
        : null,
    };

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };
  
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Používatelia</h2>
          <p className="text-sm text-muted-foreground">
            Spravujte používateľov, priraďte im roly a tímy.
          </p>
        </div>
        <Button onClick={openCreate}>Pridať používateľa</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Meno</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rola</TableHead>
            <TableHead>Tím</TableHead>
            <TableHead>Nástup</TableHead>
            <TableHead>Narodenie</TableHead>
            <TableHead>Dieťa</TableHead>
            <TableHead>Zostatok dovolenky</TableHead>
            <TableHead>Stav</TableHead>
            <TableHead className="text-right">Akcie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const teamName = teams.find((team: any) => team.id === user.teamId)?.name;
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "MANAGER" ? "default" : "secondary"}>
                    {roleLabels[user.role as keyof typeof roleLabels] ?? user.role}
                  </Badge>
                </TableCell>
                <TableCell>{teamName || "Bez tímu"}</TableCell>
                <TableCell>
                  {user.employmentStartDate ? new Date(user.employmentStartDate).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>
                  {user.birthDate ? new Date(user.birthDate).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell>{user.hasChild ? "Áno" : "Nie"}</TableCell>
                <TableCell>{user.remainingLeaveDays ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? "default" : "destructive"}>
                    {user.isActive ? "Aktívny" : "Neaktívny"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                      Upraviť
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(user)}
                      disabled={deleteMutation.isPending}
                    >
                      Odstrániť
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Upraviť používateľa" : "Pridať používateľa"}
            </DialogTitle>
            <DialogDescription>
              Vyplňte základné informácie o používateľovi a priraďte mu rolu alebo tím.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="user-name">Meno</Label>
                <Input id="user-name" {...register("name", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="user-email">Email</Label>
                <Input id="user-email" type="email" {...register("email", { required: true })} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Rola</Label>
                <Select
                  value={watch("role")}
                  onValueChange={(value) => setValue("role", value as UserFormValues["role"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Zamestnanec</SelectItem>
                    <SelectItem value="MANAGER">Manažér</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tím</Label>
                <Select
                  value={watch("teamId")}
                  onValueChange={(value) => setValue("teamId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Bez tímu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Bez tímu</SelectItem>
                    {teams.map((team: any) => (
                      <SelectItem key={team.id} value={String(team.id)}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="user-birth-date">Dátum narodenia</Label>
                <Input id="user-birth-date" type="date" {...register("birthDate")} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  id="user-has-child"
                  checked={watch("hasChild")}
                  onCheckedChange={(value) => setValue("hasChild", Boolean(value))}
                />
                <Label htmlFor="user-has-child">Má dieťa</Label>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="user-start-date">Dátum nástupu</Label>
                <Input id="user-start-date" type="date" {...register("employmentStartDate")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="user-manual-allowance">Manuálny nárok (dni)</Label>
                <Input
                  id="user-manual-allowance"
                  type="number"
                  min={0}
                  step="0.5"
                  placeholder="Napr. 12.5"
                  {...register("manualLeaveAllowanceDays")}
                />
              </div>
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
