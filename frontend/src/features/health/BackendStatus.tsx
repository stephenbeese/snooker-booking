import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchHealth } from './api';

/**
 * Phase 0 smoke check: proves the SPA reaches the backend through the Vite proxy and
 * that the backend reaches Postgres.
 */
export function BackendStatus() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.health(),
    queryFn: fetchHealth,
  });

  if (isPending) {
    return <p className="text-sm text-gray-500">Checking backend…</p>;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm font-medium text-red-700">
        Backend: unreachable ({error.message})
      </p>
    );
  }

  const dbHealthy = data.db === 'UP';

  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-felt-700">Backend: {data.status}</p>
      <p className={dbHealthy ? 'text-felt-700' : 'text-red-700'}>Database: {data.db}</p>
    </div>
  );
}
