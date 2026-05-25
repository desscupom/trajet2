/**
 * Previsão do tempo via Open-Meteo API (gratuita, sem chave).
 */

export type WeatherDay = {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  windSpeedMax: number;
  uvIndexMax: number;
};

export type WeatherAlert = {
  type: 'storm' | 'heavy_rain' | 'extreme_heat' | 'strong_wind' | 'uv_extreme';
  message: string;
  severity: 'warning' | 'danger';
};

export function weatherCodeToIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 49) return '🌫️';
  if (code <= 59) return '🌦️';
  if (code <= 69) return '🌧️';
  if (code <= 79) return '🌨️';
  if (code <= 84) return '🌦️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

export function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'Céu limpo';
  if (code <= 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if (code <= 49) return 'Névoa';
  if (code <= 59) return 'Chuvisco';
  if (code <= 69) return 'Chuva';
  if (code <= 79) return 'Neve';
  if (code <= 84) return 'Pancadas de chuva';
  if (code <= 99) return 'Tempestade';
  return 'Variável';
}

export function isSevereWeather(code: number): boolean {
  return code >= 80;
}

export function isDangerousWeather(code: number, precipMm: number, windKmh: number, uvIndex: number): boolean {
  return code >= 95 || precipMm > 30 || windKmh > 60 || uvIndex > 8;
}

export function getWeatherAlerts(day: WeatherDay): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const d = new Date(day.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  if (day.weatherCode >= 95) {
    alerts.push({ type: 'storm', severity: 'danger', message: `⛈️ Tempestade prevista em ${d}` });
  } else if (day.weatherCode >= 80) {
    alerts.push({ type: 'storm', severity: 'warning', message: `🌧️ Pancadas fortes em ${d}` });
  }
  if (day.precipitationSum > 30) {
    alerts.push({ type: 'heavy_rain', severity: day.precipitationSum > 60 ? 'danger' : 'warning', message: `🌊 Chuva intensa: ${day.precipitationSum.toFixed(0)}mm em ${d}` });
  }
  if (day.tempMax > 38) {
    alerts.push({ type: 'extreme_heat', severity: day.tempMax > 42 ? 'danger' : 'warning', message: `🌡️ Calor extremo: ${day.tempMax.toFixed(0)}°C em ${d}` });
  }
  if (day.windSpeedMax > 60) {
    alerts.push({ type: 'strong_wind', severity: day.windSpeedMax > 90 ? 'danger' : 'warning', message: `💨 Vento forte: ${day.windSpeedMax.toFixed(0)} km/h em ${d}` });
  }
  if (day.uvIndexMax > 8) {
    alerts.push({ type: 'uv_extreme', severity: 'warning', message: `☀️ UV extremo: ${day.uvIndexMax.toFixed(0)} em ${d}` });
  }
  return alerts;
}

const weatherCache = new Map<string, { data: WeatherDay[]; fetchedAt: number }>();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

export async function fetchWeatherForLocation(latitude: number, longitude: number): Promise<WeatherDay[]> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,uv_index_max&timezone=auto&forecast_days=16`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const daily = json.daily;
    if (!daily?.time) return [];
    const days: WeatherDay[] = daily.time.map((date: string, i: number) => ({
      date,
      weatherCode: daily.weather_code?.[i] ?? 0,
      tempMax: daily.temperature_2m_max?.[i] ?? 0,
      tempMin: daily.temperature_2m_min?.[i] ?? 0,
      precipitationSum: daily.precipitation_sum?.[i] ?? 0,
      windSpeedMax: daily.wind_speed_10m_max?.[i] ?? 0,
      uvIndexMax: daily.uv_index_max?.[i] ?? 0,
    }));
    weatherCache.set(key, { data: days, fetchedAt: Date.now() });
    return days;
  } catch {
    return [];
  }
}

export function getWeatherForDate(days: WeatherDay[], date: string): WeatherDay | null {
  return days.find((d) => d.date === date) ?? null;
}
