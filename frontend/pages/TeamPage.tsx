import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import RequestsList from "@/components/requests/RequestsList";
import RequestFormDialog from "@/components/requests/RequestFormDialog";

export default function TeamPage() {
  const backend = useBackend();
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [activeTab, setActiveTab] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => backend.teams.list(),
  });

  const teamId = activeTab === "all" ? undefined : Number.parseInt(activeTab, 10);
  const teamFilter = Number.isNaN(teamId) ? undefined : teamId;

  const { data: requestsData, isLoading, refetch } = useQuery({
    queryKey: ["team-requests", teamFilter ?? "all"],
    queryFn: async () => {
      return backend.leave_requests.list(teamFilter ? { teamId: teamFilter } : {});
    },
  });

  const teams = teamsData?.teams || [];
  const allRequests = requestsData?.requests || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Prehľad tímov</h1>
        {isManager && (
          <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
            Nová žiadosť
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Všetky tímy</TabsTrigger>
          {teams.map((team) => (
            <TabsTrigger key={team.id} value={String(team.id)}>
              {team.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <RequestsList requests={allRequests} isLoading={isLoading} onUpdate={refetch} showUser />
        </TabsContent>

        {teams.map((team) => (
          <TabsContent key={team.id} value={String(team.id)} className="mt-6">
            <RequestsList requests={allRequests} isLoading={isLoading} onUpdate={refetch} showUser />
          </TabsContent>
        ))}
      </Tabs>

      {showCreateDialog && (
        <RequestFormDialog
          open={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
