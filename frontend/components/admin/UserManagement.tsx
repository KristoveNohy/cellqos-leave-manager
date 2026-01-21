import { useQuery } from "@tanstack/react-query";
import backend from "~backend/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function UserManagement() {
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => backend.users.list(),
  });
  
  if (isLoading) {
    return <div className="text-center py-12">Načítava sa...</div>;
  }
  
  const users = data?.users || [];
  const roleLabels = {
    MANAGER: "Manažér",
    EMPLOYEE: "Zamestnanec",
  };
  
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Meno</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rola</TableHead>
            <TableHead>Stav</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.role === "MANAGER" ? "default" : "secondary"}>
                  {roleLabels[user.role as keyof typeof roleLabels] ?? user.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "default" : "destructive"}>
                  {user.isActive ? "Aktívny" : "Neaktívny"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
