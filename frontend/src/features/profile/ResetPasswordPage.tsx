import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { useResetPassword } from './useProfile';

const schema = z
  .object({
    newPassword: z.string().min(12, 'Use at least 12 characters').max(72),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const reset = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      await reset.mutateAsync({ token, newPassword: values.newPassword });
      // Straight to sign-in: the reset invalidated every session, including any this browser
      // held, so there is nothing to be signed in to.
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch {
      // Rendered below.
    }
  }

  // A link that arrived mangled, or someone visiting the URL directly. Better to say so than to
  // present a form whose submission is guaranteed to fail.
  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div role="alert" className="rounded-card border border-ink-300 bg-ink-50 p-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-felt-900">
            This link is not valid
          </h1>
          <p className="mt-3 text-sm text-ink-700">
            Reset links expire after 30 minutes and can only be used once.
          </p>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block text-sm font-medium text-felt-700 underline underline-offset-2"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-card border border-ink-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Choose a password</h1>
        <p className="mt-2 text-sm text-ink-600">
          You will be signed out everywhere else once this is done.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          {reset.isError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-800">
                {reset.error instanceof ApiError
                  ? reset.error.message
                  : 'Could not reset your password. Please try again.'}
              </p>
              <Link
                to="/forgot-password"
                className="mt-2 inline-block text-sm font-medium text-rose-800 underline underline-offset-2"
              >
                Request a new link
              </Link>
            </div>
          )}

          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 12 characters"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
