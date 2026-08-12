import { apiRequest } from '@/lib/apiClient';

export interface HealthResponse {
  status: string;
  db: string;
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/api/health');
}
