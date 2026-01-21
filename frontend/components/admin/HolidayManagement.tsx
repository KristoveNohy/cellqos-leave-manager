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

export default function HolidayManagement() {
  const currentYear = new Date().getFullYear();
  
  const { data, isLoading } = useQuery({
    queryKey: ["holidays", currentYear],
    queryFn: async () => backend.holidays.list({ year: currentYear }),
  });
  
  if (isLoading) {
    return <div className="text-center py-12">Načítava sa...</div>;
  }
  
  const holidays = data?.holidays || [];
  
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dátum</TableHead>
            <TableHead>Názov</TableHead>
            <TableHead>Typ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holidays.map((holiday) => (
            <TableRow key={holiday.id}>
              <TableCell className="font-medium">{holiday.date}</TableCell>
              <TableCell>{holiday.name}</TableCell>
              <TableCell>
                <Badge variant={holiday.isCompanyHoliday ? "default" : "secondary"}>
                  {holiday.isCompanyHoliday ? "Firemný" : "Voliteľný"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
