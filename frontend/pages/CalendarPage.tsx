import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as BigCalendar, momentLocalizer, View } from "react-big-calendar";
import moment from "moment";
import "moment/locale/sk";
import { useBackend } from "@/lib/backend";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import RequestFormDialog from "@/components/requests/RequestFormDialog";
import RequestDetailDialog from "@/components/requests/RequestDetailDialog";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendar.css";

const localizer = momentLocalizer(moment);
moment.locale("sk");

interface CalendarEvent {
  id: number | string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: any;
}

export default function CalendarPage() {
  const backend = useBackend();
  const [date, setDate] = useState(new Date());
  const [view, setView] = useState<View>("month");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedRange, setSelectedRange] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  
  const getViewUnit = (v: View) => {
    if (v === "agenda" || v === "work_week") return "month";
    return v as "day" | "week" | "month";
  };
  
  const startDate = moment(date).startOf(getViewUnit(view)).format("YYYY-MM-DD");
  const endDate = moment(date).endOf(getViewUnit(view)).format("YYYY-MM-DD");
  
  const { data, isLoading } = useQuery({
    queryKey: ["calendar", startDate, endDate],
    queryFn: async () => {
      return backend.calendar.get({ startDate, endDate });
    },
  });

  const { data: holidayData } = useQuery({
    queryKey: ["calendar-holidays", startDate, endDate],
    queryFn: async () => {
      const rangeStart = moment(startDate, "YYYY-MM-DD", true);
      const rangeEnd = moment(endDate, "YYYY-MM-DD", true);
      if (!rangeStart.isValid() || !rangeEnd.isValid()) {
        return { holidays: [] };
      }
      const start = moment.min(rangeStart, rangeEnd);
      const end = moment.max(rangeStart, rangeEnd);
      const years = Array.from(
        { length: end.year() - start.year() + 1 },
        (_, index) => start.year() + index
      );
      const holidayResponses = await Promise.all(
        years.map((year) => backend.holidays.list({ year }))
      );
      const holidays = holidayResponses.flatMap((response) => response.holidays || []);
      const inRange = holidays.filter((holiday) => {
        const holidayMoment = moment(holiday.date, "YYYY-MM-DD", true);
        return holidayMoment.isValid() && holidayMoment.isBetween(start, end, "day", "[]");
      });
      return { holidays: inRange };
    },
  });
  
  const typeLabels = {
    ANNUAL_LEAVE: "Dovolenka",
    SICK_LEAVE: "PN",
    HOME_OFFICE: "Home office",
    UNPAID_LEAVE: "Neplatené voľno",
    OTHER: "Iné",
  };

  const events: CalendarEvent[] = (data?.events || []).map((event) => ({
    id: event.id,
    title: `${event.userName} - ${typeLabels[event.type as keyof typeof typeLabels] ?? event.type.replace("_", " ")}`,
    start: new Date(event.startDate),
    end: new Date(event.endDate),
    resource: { ...event, kind: "LEAVE" },
  }));
  const holidayEvents: CalendarEvent[] = (holidayData?.holidays || []).map((holiday) => ({
    id: `holiday-${holiday.id}`,
    title: `Sviatok: ${holiday.name}`,
    start: moment(holiday.date).startOf("day").toDate(),
    end: moment(holiday.date).startOf("day").add(1, "day").toDate(),
    allDay: true,
    resource: { ...holiday, kind: "HOLIDAY" },
  }));
  const calendarEvents = [...events, ...holidayEvents];
  
  const eventStyleGetter = (event: CalendarEvent) => {
    if (event.resource?.kind === "HOLIDAY") {
      return {
        className: "holiday-event",
      };
    }
    const status = event.resource.status;
    const colors = {
      PENDING: "bg-yellow-500",
      APPROVED: "bg-green-500",
      REJECTED: "bg-red-500",
      CANCELLED: "bg-gray-500",
    };
    
    return {
      className: colors[status as keyof typeof colors] || "bg-blue-500",
    };
  };

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    const startMoment = moment(start);
    const endMoment = moment(end);
    const isAllDayRange =
      startMoment.hour() === 0 &&
      startMoment.minute() === 0 &&
      endMoment.hour() === 0 &&
      endMoment.minute() === 0 &&
      endMoment.diff(startMoment, "days") >= 1;
    const adjustedEnd = isAllDayRange ? endMoment.clone().subtract(1, "day") : endMoment;
    const startDate = startMoment.format("YYYY-MM-DD");
    const endDate = adjustedEnd.format("YYYY-MM-DD");

    setSelectedEvent(null);
    setSelectedRange({
      startDate,
      endDate: endDate === startDate ? startDate : endDate,
    });
    setShowCreateDialog(true);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tímový kalendár</h1>
        <Button
          onClick={() => {
            setSelectedRange(null);
            setShowCreateDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nová žiadosť
        </Button>
      </div>
      
      <Card className="p-6">
        <div className="calendar-container">
          <BigCalendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: 600 }}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            eventPropGetter={eventStyleGetter}
            onSelectEvent={(event) => {
              if (event.resource?.kind === "HOLIDAY") {
                return;
              }
              setSelectedEvent(event.resource);
            }}
            selectable
            onSelectSlot={handleSelectSlot}
            messages={{
              allDay: "Celý deň",
              previous: "Späť",
              next: "Ďalej",
              today: "Dnes",
              month: "Mesiac",
              week: "Týždeň",
              day: "Deň",
              agenda: "Agenda",
              date: "Dátum",
              time: "Čas",
              event: "Udalosť",
              noEventsInRange: "Žiadne udalosti v tomto období",
              showMore: (total) => `+${total} ďalšie`,
              work_week: "Pracovný týždeň",
            }}
          />
        </div>
      </Card>
      
      {showCreateDialog && (
        <RequestFormDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
          initialStartDate={selectedRange?.startDate}
          initialEndDate={selectedRange?.endDate}
        />
      )}
      
      {selectedEvent && (
        <RequestDetailDialog
          request={selectedEvent}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
