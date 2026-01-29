import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Notification } from "~backend/shared/types";

type NotificationWithDates = Notification & {
  createdAt: string;
  readAt: string | null;
  payloadJson: any;
};

function getNotificationContent(notification: NotificationWithDates) {
  const payload = notification.payloadJson ?? {};

  switch (notification.type) {
    case "NEW_PENDING_REQUEST":
      return {
        title: "Nová žiadosť na schválenie",
        text: `${payload.userName ?? payload.userId ?? "Neznámy používateľ"} • ${
          payload.startDate ?? "?"
        } – ${payload.endDate ?? "?"}`,
      };
    case "REQUEST_APPROVED":
      return {
        title: "Žiadosť schválená",
        text: `${payload.startDate ?? "?"} – ${payload.endDate ?? "?"}`,
      };
    case "REQUEST_REJECTED":
      return {
        title: "Žiadosť zamietnutá",
        text: `${payload.startDate ?? "?"} – ${payload.endDate ?? "?"}`,
      };
    case "REQUEST_UPDATED_BY_MANAGER":
      return {
        title: "Žiadosť upravená manažérom",
        text: `Stav: ${payload.status ?? "nezmenený"} • ${
          payload.startDate ?? "?"
        } – ${payload.endDate ?? "?"}`,
      };
    case "REQUEST_CANCELLED":
      return {
        title: "Žiadosť zrušená",
        text: `${payload.userName ?? payload.userId ?? "Neznámy používateľ"} • ${
          payload.startDate ?? "?"
        } – ${payload.endDate ?? "?"}`,
      };
    case "PASSWORD_RESET":
      return {
        title: "Heslo bolo resetované",
        text: `Reset vykonal ${payload.adminName ?? "admin"}${
          payload.adminEmail ? ` (${payload.adminEmail})` : ""
        }`,
      };
    default:
      return {
        title: "Notifikácia",
        text: JSON.stringify(payload),
      };
  }
}

export default function NotificationsPage() {
  const backend = useBackend();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const response = await backend.notifications.list();
      return response.notifications as NotificationWithDates[];
    },
  });

  const readMutation = useMutation({
    mutationFn: async (id: number) => backend.notifications.read({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: async () => backend.notifications.readAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unreadCount = useMemo(() => {
    return (notificationsQuery.data ?? []).filter((item) => !item.readAt).length;
  }, [notificationsQuery.data]);

  if (notificationsQuery.isLoading) {
    return <div className="text-center py-12">Načítavam notifikácie...</div>;
  }

  if (notificationsQuery.isError) {
    return <div className="text-center py-12 text-destructive">Notifikácie sa nepodarilo načítať.</div>;
  }

  const notifications = notificationsQuery.data ?? [];

  if (notifications.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Žiadne notifikácie.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Notifikácie</h2>
          {unreadCount > 0 && <Badge variant="secondary">{unreadCount} neprečítané</Badge>}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => readAllMutation.mutate()}
          disabled={readAllMutation.isPending || unreadCount === 0}
        >
          Označiť všetko ako prečítané
        </Button>
      </div>
      {notifications.map((notification) => {
        const content = getNotificationContent(notification);
        return (
          <Card key={notification.id} className="p-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{content.title}</span>
                {!notification.readAt && <Badge variant="secondary">Nové</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">{content.text}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(notification.createdAt).toLocaleString("sk-SK")}
              </div>
            </div>
            {!notification.readAt && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => readMutation.mutate(notification.id)}
                disabled={readMutation.isPending}
              >
                Označiť ako prečítané
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
