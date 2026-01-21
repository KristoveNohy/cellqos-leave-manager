import { useQuery } from "@tanstack/react-query";
import backend from "~backend/client";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function TeamManagement() {
  const { data, isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => backend.teams.list(),
  });
  
  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>;
  }
  
  const teams = data?.teams || [];
  
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Max Concurrent Leaves</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TableRow key={team.id}>
              <TableCell className="font-medium">{team.name}</TableCell>
              <TableCell>
                {team.maxConcurrentLeaves || "Unlimited"}
              </TableCell>
              <TableCell>
                {new Date(team.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
