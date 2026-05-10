import { Button } from '@/components/ui/button';
import { useNavigate, useRouteError } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';

export function ErrorView() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null;

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-adam-bg-secondary-dark">
      <h1 className="text-2xl font-bold text-adam-text-primary">
        Oops! Something went wrong.
      </h1>
      <p className="text-center text-adam-text-secondary">
        We're sorry, but an error occurred while loading this page.
        <br />
        Please feel free to reach out to us so that we can resolve this issue.
      </p>
      {import.meta.env.DEV && message && (
        <pre className="max-w-2xl whitespace-pre-wrap rounded-md bg-adam-bg-dark p-4 text-left text-sm text-red-300">
          {message}
        </pre>
      )}
      <Button onClick={() => navigate('/')}>Go to Home</Button>
    </div>
  );
}
