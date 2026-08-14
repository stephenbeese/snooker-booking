import { apiRequest } from '@/lib/apiClient';
import type { MenuItem } from './types';

/** The menu as customers read it: on-sale items only, already in display order. */
export function fetchMenu(): Promise<MenuItem[]> {
  return apiRequest<MenuItem[]>('/api/cafe/items');
}
