const isoDatePattern = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z\b/g;
const exactIsoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const zonelessDateTimePattern = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)$/;

/**
 * SQLite's `datetime('now')` stores UTC as `YYYY-MM-DD HH:MM:SS` with no zone
 * marker, and `new Date()` reads that form as host-local time. Every such
 * value in this app came from SQLite, so a zone-less timestamp is read as UTC.
 */
export function parseTimestamp(value: string | number | Date) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const zoneless = zonelessDateTimePattern.exec(value);

    if (zoneless) {
      return new Date(`${zoneless[1]}T${zoneless[2]}Z`);
    }
  }

  return new Date(value);
}

export function formatLocalDateTime(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }

  const date = parseTimestamp(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function isIsoDateString(value: string) {
  return exactIsoDatePattern.test(value);
}

export function replaceIsoDatesWithLocalTime(value: string) {
  return value.replace(isoDatePattern, (match) => formatLocalDateTime(match));
}
