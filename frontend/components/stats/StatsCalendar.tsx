import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatsCalendarResponse } from "~backend/shared/types";
import { leaveTypeLabel, statsEventTypes } from "@/lib/stats";

interface StatsCalendarProps {
  data?: StatsCalendarResponse;
  isLoading?: boolean;
  error?: Error | null;
  highlightMemberId?: string;
  onHighlightMember: (value: string | undefined) => void;
}

type CalendarView = "aggregate" | "people";

const weekDayLabels = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

function getMonthMatrix(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];
  const startOffset = (firstDay.getDay() + 6) % 7;
  for (let i = startOffset; i > 0; i -= 1) {
    days.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d += 1) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  while (days.length % 7 !== 0) {
    const next = new Date(year, month, lastDay.getDate() + (days.length - startOffset - lastDay.getDate()) + 1);
    days.push({ date: next, isCurrentMonth: false });
  }
  return days;
}

export default function StatsCalendar({ data, isLoading, error, highlightMemberId, onHighlightMember }: StatsCalendarProps) {
  const [view, setView] = useState<CalendarView>("aggregate");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const dayMap = useMemo(() => {
    const map = new Map<string, StatsCalendarResponse["days"][number]>();
    data?.days.forEach((day) => {
      map.set(day.date, day);
    });
    return map;
  }, [data]);

  const selectedDay = selectedDate ? dayMap.get(selectedDate) : null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Načítavam kalendár...</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Kalendár nie je dostupný.</p>;
  }

  return (
    <div className="space-y-4">
      {data.days.length === 0 && (
        <p className="text-sm text-muted-foreground">Pre zvolené filtre nie sú dostupné žiadne udalosti.</p>
      )}
      <div className="flex flex-wrap items-center gap-3 stats-no-print">
        <Button variant={view === "aggregate" ? "default" : "outline"} size="sm" onClick={() => setView("aggregate")}>
          Agregované značky
        </Button>
        <Button variant={view === "people" ? "default" : "outline"} size="sm" onClick={() => setView("people")}>
          Zoznam členov
        </Button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Zvýrazniť člena:</span>
          <select
            value={highlightMemberId ?? ""}
            onChange={(event) => onHighlightMember(event.target.value || undefined)}
            className="rounded-md border border-input bg-background px-2 py-1"
          >
            <option value="">Bez zvýraznenia</option>
            {data.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="stats-print-page">
        <CardHeader className="flex flex-col gap-2">
          <CardTitle>
            {data.teamName ? `${data.teamName} – ${data.year}` : `Tím – ${data.year}`}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Generované: {new Date().toLocaleDateString("sk-SK")} · {data.totalMembers} členov tímu
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 stats-calendar-grid md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 12 }, (_, index) => index).map((month) => {
              const monthDays = getMonthMatrix(data.year, month);
              const monthLabel = new Date(data.year, month).toLocaleDateString("sk-SK", {
                month: "long",
              });
              return (
                <div key={month} className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-semibold capitalize">{monthLabel}</div>
                  <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground">
                    {weekDayLabels.map((label) => (
                      <div key={label} className="text-center">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1 text-[10px]">
                    {monthDays.map((day) => {
                      const dateStr = day.date.toISOString().slice(0, 10);
                      const info = dayMap.get(dateStr);
                      const highlight =
                        highlightMemberId && info?.members.some((member) => member.memberId === highlightMemberId);
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => info && setSelectedDate(dateStr)}
                          className={`min-h-[32px] rounded border px-1 py-0.5 text-left ${
                            day.isCurrentMonth ? "bg-background" : "bg-muted/30"
                          } ${highlight ? "border-primary" : "border-transparent"}`}
                        >
                          <div className="font-medium">{day.date.getDate()}</div>
                          {info && view === "aggregate" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-muted-foreground">
                                {info.totalOut}/{data.totalMembers}
                              </span>
                              <div className="flex flex-wrap gap-0.5">
                                {info.typeCounts.map((type) => (
                                  <span
                                    key={type.type}
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{
                                      backgroundColor:
                                        statsEventTypes.find((item) => item.value === type.type)?.color ??
                                        "var(--color-chart-3)",
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {info && view === "people" && (
                            <div className="flex flex-col gap-0.5 text-[9px] text-muted-foreground">
                              {info.members.slice(0, 2).map((member) => (
                                <span
                                  key={`${dateStr}-${member.memberId}`}
                                  className={
                                    member.memberId === highlightMemberId ? "text-primary font-semibold" : ""
                                  }
                                >
                                  {member.memberName.split(" ")[0]}
                                </span>
                              ))}
                              {info.members.length > 2 && <span>+{info.members.length - 2}</span>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-medium">Legenda</p>
            <div className="flex flex-wrap gap-4">
              {statsEventTypes.map((type) => (
                <div key={type.value} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} />
                  <span>{type.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedDay)} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detail dňa {selectedDay?.date}</DialogTitle>
            <DialogDescription>Zoznam členov a typ udalosti pre zvolený deň.</DialogDescription>
          </DialogHeader>
          {selectedDay && (
            <div className="space-y-2 text-sm">
              {selectedDay.members.length === 0 && (
                <p className="text-muted-foreground">Žiadne udalosti.</p>
              )}
              {selectedDay.members.map((member) => (
                <div key={`${member.memberId}-${member.type}`} className="flex justify-between">
                  <span>{member.memberName}</span>
                  <span className="text-muted-foreground">{leaveTypeLabel[member.type]}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
