import type { DateValue } from "@allabout/contracts";

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

const OFFSETS: Record<string, string> = {
  UTC: "+00:00", GMT: "+00:00", EST: "-05:00", EDT: "-04:00",
  CST: "-06:00", CDT: "-05:00", MST: "-07:00", MDT: "-06:00",
  PST: "-08:00", PDT: "-07:00",
};

export function parseDateValue(rawInput: string): DateValue {
  const raw = rawInput.trim();
  const isoInstant = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})$/i);
  if (isoInstant) {
    const [, date, time, seconds = "00", zone] = isoInstant;
    const normalizedZone = zone!.toUpperCase() === "Z"
      ? "Z"
      : zone!.includes(":") ? zone! : `${zone!.slice(0, 3)}:${zone!.slice(3)}`;
    return { precision: "instant", iso: `${date}T${time}:${seconds}${normalizedZone}`, timezone: zone! };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { precision: "date", date: raw, timezone: null };
  }

  const natural = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*([A-Z]{2,5}|[A-Za-z_]+\/[A-Za-z_]+)?)?$/i);
  if (!natural) return { precision: "unknown", raw };
  const [, monthName, day, year, hourRaw, minute = "00", meridiem, timezone] = natural;
  const month = MONTHS[monthName!.toLowerCase()];
  if (!month) return { precision: "unknown", raw };
  const date = `${year}-${month}-${day!.padStart(2, "0")}`;
  if (!hourRaw) return { precision: "date", date, timezone: timezone ?? null };
  if (!timezone) return { precision: "unknown", raw };
  const offset = OFFSETS[timezone.toUpperCase()];
  if (!offset) return { precision: "unknown", raw };

  let hour = Number(hourRaw);
  if (meridiem?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;
  if (hour > 23 || Number(minute) > 59) return { precision: "unknown", raw };
  return {
    precision: "instant",
    iso: `${date}T${String(hour).padStart(2, "0")}:${minute}:00${offset}`,
    timezone,
  };
}
