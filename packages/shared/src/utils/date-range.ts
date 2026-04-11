export interface DateRange {
  start: string;
  end: string;
}

export function getDateRange(days: number, referenceDate?: string): DateRange {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const end = ref.toISOString().split('T')[0]!;
  const startDate = new Date(ref);
  startDate.setDate(startDate.getDate() - days + 1);
  const start = startDate.toISOString().split('T')[0]!;
  return { start, end };
}

export function isDateInRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]!);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
