import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import StatsLayout from "@/components/stats/StatsLayout";
import StatsFilters, { type StatsFilterState } from "@/components/stats/StatsFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBackend } from "@/lib/backend";
import { apiBaseUrl, useAuth } from "@/lib/auth";
import { buildStatsQuery, statsEventTypes } from "@/lib/stats";
import type { StatsExportFormat, StatsReportType } from "~backend/shared/types";

const reportOptions: Array<{ value: StatsReportType; label: string }> = [
  { value: "DASHBOARD_SUMMARY", label: "Dashboard – súhrn" },
  { value: "TABLE_DETAIL", label: "Tabuľka – detail" },
  { value: "YEAR_CALENDAR", label: "Rokový kalendár" },
];

const formatOptions: Array<{ value: StatsExportFormat; label: string }> = [
  { value: "PDF", label: "PDF" },
  { value: "XLSX", label: "XLSX" },
  { value: "CSV", label: "CSV" },
];

export default function StatsExportPage() {
  const backend = useBackend();
  const { user, token } = useAuth();
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
  const [reportType, setReportType] = useState<StatsReportType>("DASHBOARD_SUMMARY");
  const [format, setFormat] = useState<StatsExportFormat>("PDF");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  const exportsQuery = useQuery({
    queryKey: ["stats-exports"],
    queryFn: () => backend.stats.exports.list(),
  });

  const members = useMemo(() => {
    const list = usersData?.users ?? [];
    if (!filters.teamId) {
      return list;
    }
    return list.filter((member) => member.teamId === filters.teamId);
  }, [filters.teamId, usersData?.users]);

  const appliedQuery = useMemo(() => buildStatsQuery(appliedFilters), [appliedFilters]);
  const filterSummary = useMemo(() => {
    const summary: string[] = [];
    summary.push(`Rok ${appliedFilters.year}`);

    if (appliedFilters.month) {
      const monthName = new Date(appliedFilters.year, appliedFilters.month - 1, 1).toLocaleString("sk-SK", {
        month: "long",
      });
      summary.push(`Mesiac ${monthName}`);
    } else if (appliedFilters.quarter) {
      summary.push(`Kvartál Q${appliedFilters.quarter}`);
    } else {
      summary.push("Celý rok");
    }

    if (appliedFilters.teamId && teamsData?.teams) {
      const teamName = teamsData.teams.find((team) => team.id === appliedFilters.teamId)?.name;
      if (teamName) summary.push(`Tím ${teamName}`);
    }

    if (appliedFilters.memberIds.length > 0 && usersData?.users) {
      const names = appliedFilters.memberIds
        .map((id) => usersData.users.find((member) => member.id === id)?.name)
        .filter(Boolean);
      if (names.length > 0) summary.push(`Členovia: ${names.join(", ")}`);
    }

    const allEventTypes = statsEventTypes.map((type) => type.value);
    if (appliedFilters.eventTypes.length > 0 && appliedFilters.eventTypes.length < allEventTypes.length) {
      const labels = statsEventTypes
        .filter((type) => appliedFilters.eventTypes.includes(type.value))
        .map((type) => type.label);
      summary.push(`Typy: ${labels.join(", ")}`);
    }

    return summary.join(" · ");
  }, [appliedFilters, teamsData?.teams, usersData?.users]);

  const handleGenerate = async () => {
    setStatusMessage(null);
    setIsGenerating(true);
    try {
      await backend.stats.exports.create({
        reportType,
        format,
        filters: appliedQuery,
      });
      await exportsQuery.refetch();
      setStatusMessage("Export bol úspešne pripravený.");
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setReportType("DASHBOARD_SUMMARY");
    setFormat("PDF");
    setStatusMessage(null);
  };

  const handleDownload = async (job: { downloadUrl?: string; id: string; format: StatsExportFormat }) => {
    if (!job.downloadUrl || !token) {
      setStatusMessage("Export nemá dostupný súbor alebo chýba prihlásenie.");
      return;
    }

    try {
      setDownloadingId(job.id);
      const response = await fetch(`${apiBaseUrl}${job.downloadUrl}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "Sťahovanie exportu zlyhalo.");
      }

      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
      const fallbackName = `stats-export-${job.id}.${job.format.toLowerCase()}`;
      const filename = match?.[1] ?? fallbackName;
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <StatsLayout
      title="Export reportov"
      breadcrumb="Export"
      subtitle="Pripravte exportované reporty pre KPI, tabuľky alebo kalendár."
    >
      <StatsFilters
        filters={filters}
        teams={teamsData?.teams ?? []}
        members={members}
        onChange={setFilters}
        onApply={() => setAppliedFilters(filters)}
        onReset={handleReset}
        showTeamSelect={isAdmin}
      />

      <Card>
        <CardHeader>
          <CardTitle>Nastavenie exportu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Typ reportu</label>
            <select
              value={reportType}
              onChange={(event) => setReportType(event.target.value as StatsReportType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {reportOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Formát</label>
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value as StatsExportFormat)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {formatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Generujem..." : "Vygenerovať export"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-3">Aktívne filtre: {filterSummary}</p>
          {statusMessage && (
            <p className="text-sm text-muted-foreground md:col-span-3">{statusMessage}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>História exportov</CardTitle>
        </CardHeader>
        <CardContent>
          {exportsQuery.isLoading && <p className="text-sm text-muted-foreground">Načítavam exporty...</p>}
          {exportsQuery.error && (
            <p className="text-sm text-destructive">{(exportsQuery.error as Error).message}</p>
          )}
          {!exportsQuery.isLoading && exportsQuery.data?.exports.length === 0 && (
            <p className="text-sm text-muted-foreground">Zatiaľ nemáte žiadne exporty.</p>
          )}
          <div className="grid gap-3">
            <div className="hidden items-center gap-3 text-xs font-semibold uppercase text-muted-foreground md:grid md:grid-cols-[2fr_1fr_1fr_auto]">
              <span>Report</span>
              <span>Vytvorené</span>
              <span>Status</span>
              <span className="text-right">Akcie</span>
            </div>
            {exportsQuery.data?.exports.map((job) => (
              <div
                key={job.id}
                className="grid gap-3 rounded-md border p-3 text-sm md:grid-cols-[2fr_1fr_1fr_auto] md:items-center"
              >
                <div>
                  <p className="font-medium">
                    {reportOptions.find((option) => option.value === job.reportType)?.label}
                  </p>
                  <p className="text-muted-foreground">{job.format}</p>
                </div>
                <p className="text-muted-foreground">{new Date(job.createdAt).toLocaleString("sk-SK")}</p>
                <span className="w-fit rounded-full bg-muted px-2 py-1 text-xs">{job.status}</span>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(job)}
                    disabled={!job.downloadUrl || job.status !== "READY" || downloadingId === job.id}
                  >
                    {downloadingId === job.id ? "Sťahujem..." : "Stiahnuť"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </StatsLayout>
  );
}
