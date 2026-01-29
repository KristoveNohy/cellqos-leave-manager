import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useBackend } from "@/lib/backend";
import { useAuth } from "@/lib/auth";
import StatsLayout from "@/components/stats/StatsLayout";
import StatsFilters, { type StatsFilterState } from "@/components/stats/StatsFilters";
import StatsCharts from "@/components/stats/StatsCharts";
import StatsTable from "@/components/stats/StatsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildStatsQuery, formatNumber } from "@/lib/stats";

export default function StatsDashboardPage() {
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
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("totalDays");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

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

  const dashboardQuery = useQuery({
    queryKey: ["stats-dashboard", appliedQuery],
    queryFn: () => backend.stats.dashboard(appliedQuery),
  });

  const tableQuery = useQuery({
    queryKey: ["stats-table", appliedQuery, search, sortBy, sortDir, page],
    queryFn: () =>
      backend.stats.table({
        ...appliedQuery,
        search: search || undefined,
        sortBy,
        sortDir,
        page,
        pageSize: 10,
      }),
  });

  const kpis = dashboardQuery.data?.kpis;

  const handleApply = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setSearch("");
    setSortBy("totalDays");
    setSortDir("desc");
    setPage(1);
  };

  const handleSortChange = (value: string) => {
    if (value.includes(":")) {
      const [field, dir] = value.split(":");
      setSortBy(field);
      setSortDir(dir === "asc" ? "asc" : "desc");
      setPage(1);
      return;
    }
    setSortBy(value);
    setPage(1);
  };

  return (
    <StatsLayout
      title="Dashboard štatistík tímu"
      breadcrumb="Dashboard"
      subtitle="Agregované KPI, grafy a tabuľka udalostí pre zvolený tím."
    >
      <StatsFilters
        filters={filters}
        teams={teamsData?.teams ?? []}
        members={members}
        onChange={setFilters}
        onApply={handleApply}
        onReset={handleReset}
        isLoading={dashboardQuery.isLoading}
        showTeamSelect={isAdmin}
      />

      {dashboardQuery.isLoading && <p className="text-sm text-muted-foreground">Načítavam štatistiky...</p>}
      {dashboardQuery.error && (
        <p className="text-sm text-destructive">{(dashboardQuery.error as Error).message}</p>
      )}

      {dashboardQuery.data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Celkový počet udalostí</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{kpis?.totalEvents ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Celkový počet dní</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatNumber(kpis?.totalDays ?? 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Priemer na člena</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{formatNumber(kpis?.averageDaysPerMember ?? 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Najviac zaťažený člen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold">{kpis?.topMember?.memberName ?? "—"}</div>
              <p className="text-sm text-muted-foreground">
                {kpis?.topMember ? `${formatNumber(kpis.topMember.totalDays)} dní` : "Bez dát"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {dashboardQuery.data && (
        <StatsCharts
          trend={dashboardQuery.data.trend}
          typeBreakdown={dashboardQuery.data.typeBreakdown}
          topMembers={dashboardQuery.data.topMembers}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prehľad podľa členov</CardTitle>
        </CardHeader>
        <CardContent>
          <StatsTable
            data={tableQuery.data}
            isLoading={tableQuery.isLoading}
            error={tableQuery.error as Error | null}
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={handleSortChange}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </StatsLayout>
  );
}
