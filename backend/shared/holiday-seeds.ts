type HolidaySeed = {
  date: string;
  name: string;
  isCompanyHoliday: boolean;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function getSlovakHolidaySeeds(year: number): HolidaySeed[] {
  const easterSunday = getEasterSunday(year);
  const goodFriday = addDays(easterSunday, -2);
  const easterMonday = addDays(easterSunday, 1);
  const fixedDates: HolidaySeed[] = [
    { date: `${year}-01-01`, name: "Deň vzniku Slovenskej republiky", isCompanyHoliday: true },
    { date: `${year}-01-06`, name: "Zjavenie Pána (Traja králi)", isCompanyHoliday: true },
    { date: `${year}-05-01`, name: "Sviatok práce", isCompanyHoliday: true },
    { date: `${year}-05-08`, name: "Deň víťazstva nad fašizmom", isCompanyHoliday: true },
    { date: `${year}-07-05`, name: "Sviatok svätého Cyrila a Metoda", isCompanyHoliday: true },
    { date: `${year}-08-29`, name: "Výročie SNP", isCompanyHoliday: true },
    { date: `${year}-09-01`, name: "Deň Ústavy Slovenskej republiky", isCompanyHoliday: true },
    { date: `${year}-09-15`, name: "Sedembolestná Panna Mária", isCompanyHoliday: true },
    { date: `${year}-11-01`, name: "Sviatok Všetkých svätých", isCompanyHoliday: true },
    { date: `${year}-11-17`, name: "Deň boja za slobodu a demokraciu", isCompanyHoliday: true },
    { date: `${year}-12-24`, name: "Štedrý deň", isCompanyHoliday: true },
    { date: `${year}-12-25`, name: "Prvý sviatok vianočný", isCompanyHoliday: true },
    { date: `${year}-12-26`, name: "Druhý sviatok vianočný", isCompanyHoliday: true },
  ];

  const movableDates: HolidaySeed[] = [
    { date: formatDate(goodFriday), name: "Veľký piatok", isCompanyHoliday: true },
    { date: formatDate(easterMonday), name: "Veľkonočný pondelok", isCompanyHoliday: true },
  ];

  return [...fixedDates, ...movableDates].sort((a, b) => a.date.localeCompare(b.date));
}
