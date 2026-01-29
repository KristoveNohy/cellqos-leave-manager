import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeaveType } from "~backend/shared/types";
import { statsEventTypes } from "@/lib/stats";

export type StatsFilterState = {
  year: number;
  month?: number;
  quarter?: number;
  teamId?: number;
  memberIds: string[];
  eventTypes: LeaveType[];
};

interface StatsFiltersProps {
  filters: StatsFilterState;
  teams: Array<{ id: number; name: string }>;
  members: Array<{ id: string; name: string }>;
  onChange: (next: StatsFilterState) => void;
  onApply: () => void;
  onReset: () => void;
  isLoading?: boolean;
  showTeamSelect?: boolean;
}

const monthOptions = [
  { value: "all", label: "Celý rok" },
  { value: "1", label: "Január" },
  { value: "2", label: "Február" },
  { value: "3", label: "Marec" },
  { value: "4", label: "Apríl" },
  { value: "5", label: "Máj" },
  { value: "6", label: "Jún" },
  { value: "7", label: "Júl" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "Október" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const quarterOptions = [
  { value: "all", label: "Bez kvartálu" },
  { value: "1", label: "Q1" },
  { value: "2", label: "Q2" },
  { value: "3", label: "Q3" },
  { value: "4", label: "Q4" },
];

export default function StatsFilters({
  filters,
  teams,
  members,
  onChange,
  onApply,
  onReset,
  isLoading,
  showTeamSelect,
}: StatsFiltersProps) {
  const years = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index);

  const update = (patch: Partial<StatsFilterState>) => {
    onChange({ ...filters, ...patch });
  };

  const handleMonthChange = (value: string) => {
    update({ month: value !== "all" ? Number(value) : undefined, quarter: undefined });
  };

  const handleQuarterChange = (value: string) => {
    update({ quarter: value !== "all" ? Number(value) : undefined, month: undefined });
  };

  const handleMembersChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    update({ memberIds: selected });
  };

  const toggleEventType = (type: LeaveType, checked: boolean) => {
    const next = checked
      ? [...filters.eventTypes, type]
      : filters.eventTypes.filter((value) => value !== type);
    update({ eventTypes: next });
  };

  return (
    <Card className="stats-no-print">
      <CardHeader>
        <CardTitle className="text-lg">Filtre</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-6">
        <div className="space-y-2">
          <Label>Rok</Label>
          <Select
            value={String(filters.year)}
            onValueChange={(value) => update({ year: Number(value) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Mesiac</Label>
          <Select value={filters.month ? String(filters.month) : "all"} onValueChange={handleMonthChange}>
            <SelectTrigger>
              <SelectValue placeholder="Celý rok" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Kvartál</Label>
          <Select value={filters.quarter ? String(filters.quarter) : "all"} onValueChange={handleQuarterChange}>
            <SelectTrigger>
              <SelectValue placeholder="Bez kvartálu" />
            </SelectTrigger>
            <SelectContent>
              {quarterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showTeamSelect && (
          <div className="space-y-2">
            <Label>Tím</Label>
            <Select
              value={filters.teamId ? String(filters.teamId) : "all"}
              onValueChange={(value) => update({ teamId: value === "all" ? undefined : Number(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Všetky tímy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všetky tímy</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2 lg:col-span-2">
          <Label>Členovia</Label>
          <select
            multiple
            value={filters.memberIds}
            onChange={handleMembersChange}
            className="h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {members.length === 0 && <option>Žiadni členovia</option>}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 lg:col-span-3">
          <Label>Typ udalosti</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {statsEventTypes.map((type) => (
              <label key={type.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.eventTypes.includes(type.value)}
                  onCheckedChange={(checked) => toggleEventType(type.value, Boolean(checked))}
                />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} />
                {type.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:col-span-6">
          <Button onClick={onApply} disabled={isLoading}>
            Použiť filtre
          </Button>
          <Button variant="outline" onClick={onReset} disabled={isLoading}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
