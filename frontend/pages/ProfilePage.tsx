import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useBackend } from "@/lib/backend";
import { Card } from "@/components/ui/card";

export default function ProfilePage() {
  const { user } = useAuth();
  const backend = useBackend();

  const balanceQuery = useQuery({
    queryKey: ["leave-balance", user?.id],
    enabled: Boolean(user),
    queryFn: () => backend.leave_balances.me(),
  });

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Profil</h1>
        <p className="text-sm text-muted-foreground">
          Základné informácie o vašom účte a zostatku dovolenky.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Osobné údaje</h2>
            <p className="text-sm text-muted-foreground">Údaje prihláseného používateľa.</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Meno</span>
              <span className="font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Rola</span>
              <span className="font-medium">
                {user.role === "MANAGER" ? "Manažér" : "Zamestnanec"}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Dovolenka</h2>
            <p className="text-sm text-muted-foreground">Prehľad dostupných dní.</p>
          </div>
          {balanceQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Načítava sa zostatok...</div>
          ) : balanceQuery.isError ? (
            <div className="text-sm text-destructive">Nepodarilo sa načítať zostatok.</div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Rok</span>
                <span className="font-medium">{balanceQuery.data?.year}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Nárok</span>
                <span className="font-medium">{balanceQuery.data?.allowanceDays} dní</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Použité / plánované</span>
                <span className="font-medium">{balanceQuery.data?.usedDays} dní</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Zostatok</span>
                <span className="font-medium">{balanceQuery.data?.remainingDays} dní</span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
