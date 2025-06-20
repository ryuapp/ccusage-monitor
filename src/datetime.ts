export interface DateTime {
  date: Date;
  zoneName: string | null;
}

export interface Duration {
  minutes: number;
}

// Factory functions
export function now(): DateTime {
  return {
    date: new Date(),
    zoneName: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function fromISO(isoString: string): DateTime {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO string: ${isoString}`);
  }
  // Try to extract timezone from ISO string
  const tzMatch = isoString.match(/([+-]\d{2}:\d{2}|Z)$/);
  let zoneName: string | null = null;
  if (tzMatch) {
    // If it has timezone offset, try to determine timezone
    zoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return { date, zoneName };
}

export function max(...dates: DateTime[]): DateTime {
  if (dates.length === 0) throw new Error("No dates provided");
  return dates.reduce((max, current) =>
    current.date.getTime() > max.date.getTime() ? current : max
  );
}

export function min(...dates: DateTime[]): DateTime {
  if (dates.length === 0) throw new Error("No dates provided");
  return dates.reduce((min, current) =>
    current.date.getTime() < min.date.getTime() ? current : min
  );
}

// Timezone operations
export function setZone(dt: DateTime, timezone: string): DateTime {
  try {
    // Validate timezone by trying to use it
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return { date: dt.date, zoneName: timezone };
  } catch {
    // If invalid timezone, return current instance
    console.warn(`Invalid timezone: ${timezone}, using current timezone`);
    return dt;
  }
}

// Duration operations
export function diff(
  dt1: DateTime,
  dt2: DateTime,
  unit: "minutes" | "days" = "minutes",
): Duration {
  const diffMs = dt1.date.getTime() - dt2.date.getTime();
  const minutes = diffMs / (1000 * 60);

  if (unit === "days") {
    return { minutes: minutes };
  }
  return { minutes };
}

export function plus(
  dt: DateTime,
  duration: { minutes?: number; days?: number; hours?: number },
): DateTime {
  const newDate = new Date(dt.date);
  if (duration.minutes) {
    newDate.setMinutes(newDate.getMinutes() + duration.minutes);
  }
  if (duration.hours) {
    newDate.setHours(newDate.getHours() + duration.hours);
  }
  if (duration.days) {
    newDate.setDate(newDate.getDate() + duration.days);
  }
  return { date: newDate, zoneName: dt.zoneName };
}

export function minus(
  dt: DateTime,
  duration: { minutes?: number; days?: number; hours?: number },
): DateTime {
  return plus(dt, {
    minutes: duration.minutes ? -duration.minutes : undefined,
    hours: duration.hours ? -duration.hours : undefined,
    days: duration.days ? -duration.days : undefined,
  });
}

export function startOf(dt: DateTime, unit: "day"): DateTime {
  const newDate = new Date(dt.date);
  if (unit === "day") {
    newDate.setHours(0, 0, 0, 0);
  }
  return { date: newDate, zoneName: dt.zoneName };
}

export function set(
  dt: DateTime,
  values: { hour?: number; minute?: number },
): DateTime {
  const newDate = new Date(dt.date);
  if (values.hour !== undefined) {
    newDate.setHours(values.hour);
  }
  if (values.minute !== undefined) {
    newDate.setMinutes(values.minute);
  }
  return { date: newDate, zoneName: dt.zoneName };
}

// Formatting
export function toFormat(dt: DateTime, format: string): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");

  const hours = getHour(dt);
  const minutes = getMinute(dt);
  const seconds = dt.date.getSeconds();

  switch (format) {
    case "HH:mm":
      return `${pad(hours)}:${pad(minutes)}`;
    case "HH:mm:ss":
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Property accessors
export function getHour(dt: DateTime): number {
  if (dt.zoneName) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: dt.zoneName,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(dt.date));
  }
  return dt.date.getHours();
}

export function getMinute(dt: DateTime): number {
  if (dt.zoneName) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: dt.zoneName,
      minute: "numeric",
    });
    return parseInt(formatter.format(dt.date));
  }
  return dt.date.getMinutes();
}

export function getZoneName(dt: DateTime): string | null {
  return dt.zoneName;
}

// Comparison helpers
export function valueOf(dt: DateTime): number {
  return dt.date.getTime();
}

export function isAfter(a: DateTime, b: DateTime): boolean {
  return valueOf(a) > valueOf(b);
}

export function isBefore(a: DateTime, b: DateTime): boolean {
  return valueOf(a) < valueOf(b);
}
