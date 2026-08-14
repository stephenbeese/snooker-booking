import { apiRequest } from '@/lib/apiClient';
import type { MenuSection } from './types';

/**
 * The menu as customers read it.
 *
 * <p>On-sale items only, grouped into sections and already in the club's own order — see
 * `CafeController` for why the grouping is the server's job rather than this client's.
 */
export function fetchMenu(): Promise<MenuSection[]> {
  return apiRequest<MenuSection[]>('/api/cafe/items');
}
