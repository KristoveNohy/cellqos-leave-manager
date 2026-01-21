import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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

type TeamFormValues = {
  name: string;
  maxConcurrentLeaves: string;
};

export default function TeamManagement() {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => backend.teams.list(),
  });
  const { register, handleSubmit, reset } = useForm<TeamFormValues>({
    defaultValues: {
      name: "",
      maxConcurrentLeaves: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; maxConcurrentLeaves?: number | null }) =>
      backend.teams.create(payload),
    onSuccess: () => {
      toast({ title: "Tím bol vytvorený." });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Vytvorenie tímu zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: number } & Record<string, unknown>) =>
      backend.teams.update(payload),
    onSuccess: () => {
      toast({ title: "Tím bol upravený." });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Úprava tímu zlyhala",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: { id: number }) => backend.teams.remove(payload),
    onSuccess: () => {
      toast({ title: "Tím bol odstránený." });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error: any) => {
      toast({
        title: "Odstránenie tímu zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  if (isLoading) {
    return <div className="text-center py-12">Načítava sa...</div>;
  }
  
  const teams = data?.teams || [];

  const openCreate = () => {
    setEditingTeam(null);
    reset({ name: "", maxConcurrentLeaves: "" });
    setDialogOpen(true);
  };

  const openEdit = (team: any) => {
    setEditingTeam(team);
    reset({
      name: team.name ?? "",
      maxConcurrentLeaves: team.maxConcurrentLeaves ? String(team.maxConcurrentLeaves) : "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (team: any) => {
    const confirmed = window.confirm(`Naozaj chcete odstrániť tím ${team.name}?`);
    if (confirmed) {
      deleteMutation.mutate({ id: team.id });
    }
  };

  const onSubmit = (values: TeamFormValues) => {
    const payload = {
      name: values.name.trim(),
      maxConcurrentLeaves: values.maxConcurrentLeaves ? Number(values.maxConcurrentLeaves) : null,
    };

    if (editingTeam) {
      updateMutation.mutate({ id: editingTeam.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };
  
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tímy</h2>
          <p className="text-sm text-muted-foreground">
            Vytvárajte a upravujte tímy a ich limity dovoleniek.
          </p>
        </div>
        <Button onClick={openCreate}>Pridať tím</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Názov</TableHead>
            <TableHead>Max. súbežných dovoleniek</TableHead>
            <TableHead>Vytvorené</TableHead>
            <TableHead className="text-right">Akcie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TableRow key={team.id}>
              <TableCell className="font-medium">{team.name}</TableCell>
              <TableCell>
                {team.maxConcurrentLeaves || "Neobmedzené"}
              </TableCell>
              <TableCell>
                {new Date(team.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(team)}>
                    Upraviť
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(team)}
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
              {editingTeam ? "Upraviť tím" : "Pridať tím"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="team-name">Názov tímu</Label>
              <Input id="team-name" {...register("name", { required: true })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="team-limit">Max. súbežných dovoleniek</Label>
              <Input
                id="team-limit"
                type="number"
                min={0}
                {...register("maxConcurrentLeaves")}
                placeholder="Neobmedzené"
              />
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
