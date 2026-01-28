import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import ChangePasswordForm from "@/components/auth/ChangePasswordForm";

export default function ForcePasswordChangeDialog() {
  const { session, setSession } = useAuth();
  const mustChangePassword = Boolean(session?.user.mustChangePassword);

  const handleSuccess = useMemo(
    () => () => {
      if (!session) return;
      setSession({
        ...session,
        user: {
          ...session.user,
          mustChangePassword: false,
        },
      });
    },
    [session, setSession]
  );

  return (
    <Dialog open={mustChangePassword}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Je potrebné zmeniť heslo</DialogTitle>
          <DialogDescription>
            Pri prvom prihlásení musíte zmeniť predvolené heslo na vlastné.
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm onSuccess={handleSuccess} submitLabel="Uložiť nové heslo" />
      </DialogContent>
    </Dialog>
  );
}
