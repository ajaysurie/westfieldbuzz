function timeZoneOffsetMilliseconds(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  const representedAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );
  return representedAsUtc - instant;
}

export function parseSourceDateTime(value: unknown, timeZone: string): Date {
  const raw = String(value ?? "").trim();
  if (!raw) return new Date(Number.NaN);

  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return new Date(raw);
  }

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return new Date(raw);

  const [, year, month, day, hour = "00", minute = "00", second = "00"] =
    match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  let offset = timeZoneOffsetMilliseconds(localAsUtc, timeZone);
  let instant = localAsUtc - offset;
  const correctedOffset = timeZoneOffsetMilliseconds(instant, timeZone);
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    instant = localAsUtc - offset;
  }

  return new Date(instant);
}

