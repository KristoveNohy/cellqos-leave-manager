import { Card } from "@/components/ui/card";

export default function VacationPolicyManagement() {
  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Politiky dovoleniek</h2>
        <p className="text-sm text-muted-foreground">
          Základné pravidlá pre čerpanie a prenos dovoleniek v systéme.
        </p>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <h3 className="font-medium">Accrual</h3>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>Mesačný: nárok sa pripisuje každý mesiac počas roka.</li>
            <li>Ročný: celý nárok sa pripíše na začiatku roka.</li>
          </ul>
        </div>
        <div>
          <h3 className="font-medium">Carry-over</h3>
          <p className="text-muted-foreground">
            Nevyčerpaná dovolenka sa môže preniesť do ďalšieho obdobia podľa
            nastaveného limitu.
          </p>
        </div>
        <div>
          <h3 className="font-medium">Expiry</h3>
          <p className="text-muted-foreground">
            Prenesená dovolenka podlieha expiracii po uplynutí definovaného
            termínu.
          </p>
        </div>
        <div>
          <h3 className="font-medium">Pro-rata pri nástupe/odchode</h3>
          <p className="text-muted-foreground">
            Nárok sa prepočítava pomerne podľa počtu odpracovaných mesiacov v
            danom roku.
          </p>
        </div>
      </div>
    </Card>
  );
}
