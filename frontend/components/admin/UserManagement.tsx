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
    return <div className="text-center py-12">Loading...</div>;
  }
  
  const users = data?.users || [];
  
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={user.role === "MANAGER" ? "default" : "secondary"}>
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "default" : "destructive"}>
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
