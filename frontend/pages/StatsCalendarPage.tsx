import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
  const currentYear = new Date().getFullYear();
  const isAdmin = user?.role === "ADMIN";

  const defaultFilters: StatsFilterState = useMemo(() => {
    const yearParam = Number(searchParams.get("year") ?? currentYear);
    const monthParam = searchParams.get("month");
    const quarterParam = searchParams.get("quarter");
    const teamParam = searchParams.get("teamId");
    const memberParam = searchParams.get("memberIds");
    const eventTypesParam = searchParams.get("eventTypes");
    const parsedYear = Number.isFinite(yearParam) ? yearParam : currentYear;
    const parsedMonth = monthParam ? Number(monthParam) : undefined;
    const parsedQuarter = quarterParam ? Number(quarterParam) : undefined;
    const parsedTeam = teamParam ? Number(teamParam) : undefined;
    const parsedMembers = memberParam ? memberParam.split(",").filter(Boolean) : [];
    const parsedEventTypes = eventTypesParam
      ? (eventTypesParam.split(",").filter(Boolean) as StatsFilterState["eventTypes"])
      : ["ANNUAL_LEAVE", "SICK_LEAVE", "HOME_OFFICE", "UNPAID_LEAVE", "OTHER"];

    return {
      year: parsedYear,
      month: parsedMonth,
      quarter: parsedQuarter,
      teamId: parsedTeam,
      memberIds: parsedMembers,
      eventTypes: parsedEventTypes,
    };
  }, [currentYear, searchParams]);

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

  const isExportReady = calendarQuery.isSuccess && !calendarQuery.isFetching;

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
      <div className="space-y-6" data-export-ready={isExportReady ? "true" : "false"}>
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
      </div>
    </StatsLayout>
  );
}
