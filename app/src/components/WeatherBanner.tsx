"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Downtown Westfield.
const LATITUDE = 40.6516;
const LONGITUDE = -74.3473;
const RAIN_THRESHOLD = 50;

interface WeatherBannerProps {
  /** Inclusive local-date bounds (YYYY-MM-DD) the banner should speak to. */
  startKey: string;
  endKey: string;
}

interface DailyForecast {
  time: string[];
  precipitation_probability_max: (number | null)[];
}

function dayName(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

export function rainyDaysInRange(forecast: DailyForecast, startKey: string, endKey: string): string[] {
  return forecast.time.filter((key, index) =>
    key >= startKey && key <= endKey
      && (forecast.precipitation_probability_max[index] ?? 0) >= RAIN_THRESHOLD
  );
}

export default function WeatherBanner({ startKey, endKey }: WeatherBannerProps) {
  const [rainyDays, setRainyDays] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}`
      + "&daily=precipitation_probability_max&timezone=America%2FNew_York&forecast_days=7";
    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: DailyForecast | null) => {
        if (!cancelled && data?.time) setRainyDays(rainyDaysInRange(data, startKey, endKey));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [startKey, endKey]);

  if (rainyDays.length === 0) return null;

  const names = rainyDays.map(dayName);
  const when = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return (
    <div className="weather-banner" role="status">
      <span className="weather-banner__icon" aria-hidden="true">☂</span>
      <p><strong>Rain expected {when}.</strong> Indoor picks might be the better plan.</p>
      <Link href={`/search?q=${encodeURIComponent("indoor activities " + when)}`}>See indoor picks →</Link>
    </div>
  );
}
