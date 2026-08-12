import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './app/queryClient';
import { BackendStatus } from './features/health/BackendStatus';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-semibold text-felt-900">Snooker Club</h1>
        <p className="mt-1 text-sm text-gray-600">Table booking system</p>
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <BackendStatus />
        </div>
      </main>
    </QueryClientProvider>
  );
}
