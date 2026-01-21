import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UserManagement from "@/components/admin/UserManagement";
import TeamManagement from "@/components/admin/TeamManagement";
import HolidayManagement from "@/components/admin/HolidayManagement";
import DatabaseManagement from "@/components/admin/DatabaseManagement";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Administrátorské nastavenia</h1>
      </div>
      
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Používatelia</TabsTrigger>
          <TabsTrigger value="teams">Tímy</TabsTrigger>
          <TabsTrigger value="holidays">Sviatky</TabsTrigger>
          <TabsTrigger value="database">Databáza</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users" className="mt-6">
          <UserManagement />
        </TabsContent>
        
        <TabsContent value="teams" className="mt-6">
          <TeamManagement />
        </TabsContent>
        
        <TabsContent value="holidays" className="mt-6">
          <HolidayManagement />
        </TabsContent>

        <TabsContent value="database" className="mt-6">
          <DatabaseManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
