import { useState } from "react";
import { useBackend } from "@/lib/backend";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DatabaseManagement() {
  const backend = useBackend();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [inputKey, setInputKey] = useState(0);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const backup = await backend.database.export();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `database-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Záloha databázy bola pripravená na stiahnutie." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export zlyhal.";
      toast({ title: "Export databázy zlyhal", description: message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!backupFile) {
      toast({ title: "Vyberte súbor so zálohou." });
      return;
    }

    setIsImporting(true);
    try {
      const raw = await backupFile.text();
      const backup = JSON.parse(raw);
      await backend.database.import({ backup, confirm: confirmText });
      toast({ title: "Databáza bola obnovená." });
      setBackupFile(null);
      setConfirmText("");
      setInputKey((prev) => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import zlyhal.";
      toast({ title: "Import databázy zlyhal", description: message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const isConfirmValid = confirmText.trim().toUpperCase() === "IMPORT";

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Bezpečná záloha databázy</h2>
          <p className="text-sm text-muted-foreground">
            Vytvorte úplnú zálohu databázy na bezpečné uloženie alebo prenos do iného prostredia.
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? "Exportujem..." : "Stiahnuť zálohu"}
        </Button>
      </Card>

      <Card className="p-6 space-y-4 border-destructive/40">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Obnova databázy</h2>
          <p className="text-sm text-muted-foreground">
            Import prepíše všetky existujúce dáta. Pokračujte iba ak máte aktuálnu zálohu.
          </p>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="backup-file">Súbor so zálohou (JSON)</Label>
            <Input
              key={inputKey}
              id="backup-file"
              type="file"
              accept="application/json"
              onChange={(event) => setBackupFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-import">Potvrďte import napísaním IMPORT</Label>
            <Input
              id="confirm-import"
              placeholder="IMPORT"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
          </div>
        </div>
        <Button
          variant="destructive"
          onClick={handleImport}
          disabled={isImporting || !backupFile || !isConfirmValid}
        >
          {isImporting ? "Importujem..." : "Obnoviť databázu"}
        </Button>
      </Card>
    </div>
  );
}
