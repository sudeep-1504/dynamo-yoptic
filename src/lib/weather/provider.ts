// Weather provider behind an interface (PRD BE-8). Swapping providers is a config
// change, not an architecture change — field names are mapped to our generic signal
// shape here and NOWHERE else. The rest of the system reads {precip_now, apparent_temp}.

export interface WeatherReadings {
  // Live current conditions -> our two signal types.
  precip_now: number; // mm/h
  apparent_temp: number; // feels-like, C
  temp_c: number; // raw air temp, C (for display)
  condition: string; // human label, e.g. "Light rain"
  // Forecast is used ONLY to tune polling cadence, never as a decision input.
  forecast_transition_soon: boolean;
  provider: string;
}

export interface WeatherProvider {
  name: string;
  fetch(lat: number, lng: number): Promise<WeatherReadings>;
}

// --- WeatherAPI.com adapter (the locked provider) ---
// Free tier permits commercial use; one call returns current + hourly forecast.
class WeatherApiProvider implements WeatherProvider {
  name = "weatherapi";
  constructor(private apiKey: string) {}

  async fetch(lat: number, lng: number): Promise<WeatherReadings> {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.apiKey}&q=${lat},${lng}&hours=6&aqi=no&alerts=no`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`WeatherAPI ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const cur = data.current;
    // Field mapping lives ONLY here.
    const precip_now = Number(cur.precip_mm ?? 0);
    const apparent_temp = Number(cur.feelslike_c ?? cur.temp_c ?? 0);
    const temp_c = Number(cur.temp_c ?? 0);
    const condition = String(cur.condition?.text ?? "Unknown");

    // Forecast-weighted cadence: does any of the next few hours cross a threshold?
    const hours: any[] = data.forecast?.forecastday?.[0]?.hour ?? [];
    const nowHour = new Date().getHours();
    const upcoming = hours.filter((h) => new Date(h.time).getHours() > nowHour).slice(0, 6);
    const forecast_transition_soon = upcoming.some(
      (h) =>
        Number(h.precip_mm ?? 0) > 0.2 ||
        Number(h.feelslike_c ?? 0) >= 35 ||
        Number(h.chance_of_rain ?? 0) >= 60
    );

    return {
      precip_now,
      apparent_temp,
      temp_c,
      condition,
      forecast_transition_soon,
      provider: this.name,
    };
  }
}

export function getWeatherProvider(): WeatherProvider | null {
  const key = process.env.WEATHERAPI_KEY;
  if (!key) return null; // injection-first: no key => real fetches disabled, injection still works
  return new WeatherApiProvider(key);
}
