import { apiRequest } from '@/lib/apiClient';
import type { Club } from './types';

export function fetchClub(): Promise<Club> {
  return apiRequest<Club>('/api/club');
}
