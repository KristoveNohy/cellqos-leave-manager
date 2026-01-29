import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StatsLayout from "@/components/stats/StatsLayout";
import StatsFilters, { type StatsFilterState } from "@/components/stats/StatsFilters";
import StatsCalendar from "@/components/stats/StatsCalendar";
import { useBackend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import { buildStatsQuery } from "@/lib/stats";

export default function StatsCalendarPage() {
  const backend = useBackend();
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const isAdmin = user?.role === "ADMIN";

  const defaultFilters: StatsFilterState = {
    year: currentYear,
    month: undefined,
    quarter: undefined,
    teamId: undefined,
    memberIds: [],
    eventTypes: ["ANNUAL_LEAVE", "SICK_LEAVE", "HOME_OFFICE", "UNPAID_LEAVE", "OTHER"],
  };

  const [filters, setFilters] = useState<StatsFilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<StatsFilterState>(defaultFilters);
  const [highlightMemberId, setHighlightMemberId] = useState<string | undefined>(undefined);

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => backend.teams.list(),
    enabled: isAdmin,
  });

  const { data: usersData } = useQuery({
    queryKey: ["stats-users"],
    queryFn: () => backend.users.list(),
    enabled: Boolean(user),
  });

  const members = useMemo(() => {
    const list = usersData?.users ?? [];
    if (!filters.teamId) {
      return list;
    }
    return list.filter((member) => member.teamId === filters.teamId);
  }, [filters.teamId, usersData?.users]);

  const appliedQuery = useMemo(() => buildStatsQuery(appliedFilters), [appliedFilters]);

  const calendarQuery = useQuery({
    queryKey: ["stats-calendar", appliedQuery],
    queryFn: () => backend.stats.calendar(appliedQuery),
  });

  const handleApply = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setHighlightMemberId(undefined);
  };

  return (
    <StatsLayout
      title="Ročný A3 kalendár"
      breadcrumb="Kalendár"
      subtitle="Celý rok na jednej stránke s detailmi absencií tímu."
    >
      <StatsFilters
        filters={filters}
        teams={teamsData?.teams ?? []}
        members={members}
        onChange={setFilters}
        onApply={handleApply}
        onReset={handleReset}
        isLoading={calendarQuery.isLoading}
        showTeamSelect={isAdmin}
      />

      <StatsCalendar
        data={calendarQuery.data}
        isLoading={calendarQuery.isLoading}
        error={calendarQuery.error as Error | null}
        highlightMemberId={highlightMemberId}
        onHighlightMember={setHighlightMemberId}
      />
    </StatsLayout>
  );
}
