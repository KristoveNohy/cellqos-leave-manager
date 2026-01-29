import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { StatsTableResponse } from "~backend/shared/types";
import { formatNumber, leaveTypeLabel } from "@/lib/stats";

interface StatsTableProps {
  data?: StatsTableResponse;
  isLoading?: boolean;
  error?: Error | null;
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSortChange: (value: string) => void;
  onPageChange: (page: number) => void;
}

export default function StatsTable({
  data,
  isLoading,
  error,
  search,
  onSearchChange,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
}: StatsTableProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const selectedRow = useMemo(
    () => rows.find((row) => row.memberId === selectedMemberId) ?? null,
    [rows, selectedMemberId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Vyhľadať člena..."
          className="max-w-xs"
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Triediť podľa:</span>
          <select
            value={sortBy}
            onChange={(event) => onSortChange(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1"
          >
            <option value="totalDays">Počet dní</option>
            <option value="totalEvents">Počet udalostí</option>
            <option value="name">Meno</option>
            <option value="lastEventDate">Posledná udalosť</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSortChange(`${sortBy}:${sortDir === "asc" ? "desc" : "asc"}`)}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Načítavam tabuľku...</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Žiadne dáta pre zvolené filtre.</p>
      )}

      {rows.length > 0 && (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Člen</TableHead>
                <TableHead>Udalosti</TableHead>
                <TableHead>Dni</TableHead>
                <TableHead>Posledná udalosť</TableHead>
                <TableHead>Typy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.memberId}
                  className="cursor-pointer"
                  onClick={() => setSelectedMemberId(row.memberId)}
                >
                  <TableCell className="font-medium">{row.memberName}</TableCell>
                  <TableCell>{row.totalEvents}</TableCell>
                  <TableCell>{formatNumber(row.totalDays)}</TableCell>
                  <TableCell>{row.lastEventDate ?? "—"}</TableCell>
                  <TableCell>
                    {row.typeBreakdown.length === 0
                      ? "—"
                      : row.typeBreakdown.map((item) => leaveTypeLabel[item.type]).join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Strana {page} z {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            Predošlá
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Ďalšia
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(selectedRow)} onOpenChange={() => setSelectedMemberId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prehľad člena</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium">{selectedRow.memberName}</p>
                <p className="text-muted-foreground">{selectedRow.totalEvents} udalostí</p>
              </div>
              <div className="grid gap-2">
                {selectedRow.typeBreakdown.length === 0 && (
                  <p className="text-muted-foreground">Bez udalostí v období.</p>
                )}
                {selectedRow.typeBreakdown.map((item) => (
                  <div key={item.type} className="flex justify-between">
                    <span>{leaveTypeLabel[item.type]}</span>
                    <span>{formatNumber(item.totalDays)} dní</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
