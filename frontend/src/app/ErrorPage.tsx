import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/Button';
import { PageShell } from '@/components/ui/PageShell';

/**
 * What renders when a route has no match, or when one throws.
 *
 * <p>Without this a typo'd URL rendered the header and footer around an empty `<main>` — which
 * looks exactly like a page that failed to load, and gave no way onward but the back button.
 *
 * <p>The error's own text is deliberately not shown. A thrown render error can carry a stack or
 * an internal message, and the person reading it can do nothing with either; the console still
 * has it for whoever is debugging.
 */
export function ErrorPage({ notFound: forceNotFound }: { notFound?: boolean } = {}) {
  const error = useRouteError();
  // Two ways in. The catch-all route renders this directly for an unmatched path and says so
  // through the prop, where there is no thrown error to inspect; `errorElement` renders it with
  // one. Without the prop a plain mistyped URL would read as "something went wrong", which
  // suggests a fault at the club's end rather than a bad link.
  const notFound = forceNotFound ?? (isRouteErrorResponse(error) && error.status === 404);

  return (
    <PageShell width="sm">
      <div className="py-12 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-fg-muted">
          {notFound ? '404' : 'Something went wrong'}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-felt-900 sm:text-3xl">
          {notFound ? 'That page does not exist' : 'This page could not be shown'}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-fg-muted">
          {notFound
            ? 'The link may be out of date, or the address mistyped.'
            : 'Please try again. If it keeps happening, let the club know.'}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/">
            <Button>Back to the home page</Button>
          </Link>
          <Link to="/book">
            <Button variant="secondary">Book a table</Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
