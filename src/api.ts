export type IrrigationMode = 'auto' | 'manual';

export interface IrrigationStatus {
  soilPercent: number;
  tankPercent: number;
  temperatureC: number | null;
  humidityPercent: number | null;
  pumpOn: boolean;
  mode: IrrigationMode;
  moistureThreshold: number;
  soilValid: boolean;
  tankValid: boolean;
  climateValid: boolean;
  updatedAt: number;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) throw new Error(`Controller returned ${response.status}`);
  return response.json() as Promise<T>;
}

export const irrigationApi = {
  status: (baseUrl: string) => request<IrrigationStatus>(baseUrl, '/api/status'),
  configure: (baseUrl: string, moistureThreshold: number) =>
    request<{ ok: boolean }>(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify({ moistureThreshold }),
    }),
  control: (baseUrl: string, mode: IrrigationMode, pump?: boolean) =>
    request<{ ok: boolean; pumpOn: boolean }>(baseUrl, '/api/control', {
      method: 'POST',
      body: JSON.stringify({ mode, pump }),
    }),
};
