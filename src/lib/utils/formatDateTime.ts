const isoDatePattern = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z\b/g;
const exactIsoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function formatLocalDateTime(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);

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
