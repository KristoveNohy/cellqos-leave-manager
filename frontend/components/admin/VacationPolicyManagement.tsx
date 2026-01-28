import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { VacationAccrualPolicy } from "~backend/shared/types";
import { useBackend } from "@/lib/backend";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type VacationPolicyFormValues = {
  accrualPolicy: VacationAccrualPolicy;
  carryOverEnabled: boolean;
};

export default function VacationPolicyManagement() {
  const backend = useBackend();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["vacation-policy"],
    queryFn: () => backend.vacation_policy.get(),
  });
  const { handleSubmit, reset, setValue, watch } = useForm<VacationPolicyFormValues>({
    defaultValues: {
      accrualPolicy: "PRO_RATA",
      carryOverEnabled: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      accrualPolicy: VacationAccrualPolicy;
      carryOverEnabled: boolean;
      carryOverLimitHours: number;
    }) => backend.vacation_policy.update(payload),
    onSuccess: (response) => {
      toast({ title: "Politika dovoleniek bola uložená." });
      const policy = response.policy;
      reset({
        accrualPolicy: policy.accrualPolicy,
        carryOverEnabled: policy.carryOverEnabled,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Uloženie zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (data?.policy) {
      reset({
        accrualPolicy: data.policy.accrualPolicy,
        carryOverEnabled: data.policy.carryOverEnabled,
      });
    }
  }, [data, reset]);

  if (isLoading) {
    return <div className="text-center py-12">Načítava sa...</div>;
  }

  const onSubmit = (values: VacationPolicyFormValues) => {
    updateMutation.mutate({
      accrualPolicy: values.accrualPolicy,
      carryOverEnabled: values.carryOverEnabled,
      carryOverLimitHours: 0,
    });
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Politiky dovoleniek</h2>
        <p className="text-sm text-muted-foreground">
          Nastavte firmu politiku pre nárokovanie a prenos dovoleniek.
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Label>Spôsob nároku</Label>
          <Select
            value={watch("accrualPolicy")}
            onValueChange={(value) => setValue("accrualPolicy", value as VacationAccrualPolicy)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YEAR_START">Ročný (celý nárok na začiatku roka)</SelectItem>
              <SelectItem value="PRO_RATA">Pro-rata pri nástupe/odchode</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Pro-rata prepočíta nárok podľa počtu odpracovaných mesiacov v danom roku.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="carry-over-enabled"
              checked={watch("carryOverEnabled")}
              onCheckedChange={(value) => setValue("carryOverEnabled", Boolean(value))}
            />
            <Label htmlFor="carry-over-enabled">Povoliť prenos nevyčerpanej dovolenky</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Prenášať sa môže maximálne výška ročného nároku (160 alebo 200 hodín podľa skupiny).
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Ukladá sa..." : "Uložiť"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
