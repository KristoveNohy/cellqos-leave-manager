import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatsTrendPoint, StatsTypeBreakdown, StatsTopMember } from "~backend/shared/types";
import { formatNumber, leaveTypeLabel, statsEventTypes } from "@/lib/stats";

interface StatsChartsProps {
  trend: StatsTrendPoint[];
  typeBreakdown: StatsTypeBreakdown[];
  topMembers: StatsTopMember[];
}

function TrendChart({ data }: { data: StatsTrendPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Žiadne dáta pre trend.</p>;
  }

  const maxValue = Math.max(...data.map((item) => item.totalDays), 1);
  const points = data
    .map((item, index) => {
      const x = (index / (data.length - 1 || 1)) * 100;
      const y = 100 - (item.totalDays / maxValue) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="h-40 w-full">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <polyline
          fill="none"
          stroke="var(--color-chart-1)"
          strokeWidth="3"
          points={points}
        />
        {data.map((item, index) => {
          const x = (index / (data.length - 1 || 1)) * 100;
          const y = 100 - (item.totalDays / maxValue) * 100;
          return <circle key={item.month} cx={x} cy={y} r={2.5} fill="var(--color-chart-2)" />;
        })}
      </svg>
      <div className="mt-2 grid grid-cols-6 gap-1 text-xs text-muted-foreground">
        {data.map((item) => (
          <div key={item.month} className="text-center">{item.month}</div>
        ))}
      </div>
    </div>
  );
}

function TypeDistribution({ data }: { data: StatsTypeBreakdown[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Žiadne dáta podľa typu.</p>;
  }

  const total = data.reduce((sum, item) => sum + item.totalDays, 0) || 1;

  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {data.map((item) => {
          const config = statsEventTypes.find((type) => type.value === item.type);
          const width = (item.totalDays / total) * 100;
          return (
            <div
              key={item.type}
              style={{ width: `${width}%`, backgroundColor: config?.color ?? "var(--color-chart-3)" }}
            />
          );
        })}
      </div>
      <div className="grid gap-2 text-sm">
        {data.map((item) => (
          <div key={item.type} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    statsEventTypes.find((type) => type.value === item.type)?.color ?? "var(--color-chart-3)",
                }}
              />
              <span>{leaveTypeLabel[item.type]}</span>
            </div>
            <span className="text-muted-foreground">{formatNumber(item.totalDays)} dní</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopMembersChart({ data }: { data: StatsTopMember[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Žiadne dáta o členoch.</p>;
  }

  const maxValue = Math.max(...data.map((item) => item.totalDays), 1);

  return (
    <div className="space-y-3">
      {data.map((member) => (
        <div key={member.memberId} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{member.memberName}</span>
            <span className="text-muted-foreground">{formatNumber(member.totalDays)} dní</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${(member.totalDays / maxValue) * 100}%`,
                backgroundColor: "var(--color-chart-4)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StatsCharts({ trend, typeBreakdown, topMembers }: StatsChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Trend podľa mesiacov</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Rozdelenie podľa typu</CardTitle>
        </CardHeader>
        <CardContent>
          <TypeDistribution data={typeBreakdown} />
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Top členovia</CardTitle>
        </CardHeader>
        <CardContent>
          <TopMembersChart data={topMembers} />
        </CardContent>
      </Card>
    </div>
  );
}
