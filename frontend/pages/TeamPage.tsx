import { useQuery } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RequestsList from "@/components/requests/RequestsList";

export default function TeamPage() {
  const backend = useBackend();
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => backend.teams.list(),
  });
  
  const { data: requestsData, isLoading, refetch } = useQuery({
    queryKey: ["team-requests"],
    queryFn: async () => {
      return backend.leave_requests.list({});
    },
  });
  
  const teams = teamsData?.teams || [];
  const allRequests = requestsData?.requests || [];
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Prehľad tímov</h1>
      </div>
      
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Všetky tímy</TabsTrigger>
          {teams.map((team) => (
            <TabsTrigger key={team.id} value={String(team.id)}>
              {team.name}
            </TabsTrigger>
          ))}
        </TabsList>
        
        <TabsContent value="all" className="mt-6">
          <RequestsList
            requests={allRequests}
            isLoading={isLoading}
            onUpdate={refetch}
            showUser
          />
        </TabsContent>
        
        {teams.map((team) => (
          <TabsContent key={team.id} value={String(team.id)} className="mt-6">
            <RequestsList
              requests={allRequests.filter((r: any) => {
                return true;
              })}
              isLoading={isLoading}
              onUpdate={refetch}
              showUser
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
