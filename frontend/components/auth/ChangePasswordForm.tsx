import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useBackend } from "@/lib/backend";

interface ChangePasswordFormProps {
  onSuccess?: () => void;
  submitLabel?: string;
}

export default function ChangePasswordForm({ onSuccess, submitLabel }: ChangePasswordFormProps) {
  const backend = useBackend();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Heslá sa nezhodujú",
        description: "Skontrolujte, či sú nové heslá rovnaké.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await backend.auth.changePassword({
        currentPassword,
        newPassword,
      });
      toast({ title: "Heslo bolo zmenené." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Zmena hesla zlyhala",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="current-password">Aktuálne heslo</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">Nové heslo</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Potvrďte nové heslo</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Ukladá sa..." : submitLabel ?? "Zmeniť heslo"}
      </Button>
    </form>
  );
}
