import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useRequestPasswordReset } from './useProfile';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address').max(254),
});

type FormValues = z.infer<typeof schema>;

/**
 * Requests a reset link.
 *
 * <p>The confirmation is deliberately identical whether or not the address has an account — it
 * mirrors the server, which answers the same way for the same reason. Saying "no account found"
 * here would hand anyone with a list of addresses a free membership check, and would do it
 * without ever contacting the server's own protections.
 */
export function ForgotPasswordPage() {
  const request = useRequestPasswordReset();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      await request.mutateAsync(values.email);
    } catch {
      // Rendered below.
    }
  }

  if (request.isSuccess) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div
          role="status"
          className="rounded-card border border-felt-200 bg-felt-50 p-8 text-center"
        >
          <h1 className="text-xl font-semibold tracking-tight text-felt-900">Check your email</h1>
          <p className="mt-3 text-sm text-felt-900">
            If that address has an account, we have sent a link to reset your password. It expires
            in 30 minutes.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block text-sm font-medium text-felt-700 underline underline-offset-2"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-card border border-ink-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Forgot password</h1>
        <p className="mt-2 text-sm text-ink-600">
          Enter your email address and we'll send you a link to choose a new password.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          {request.isError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-800">
                Could not send the link. Please try again shortly.
              </p>
            </div>
          )}

          <TextField
            label="Email address"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />

          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-ink-600">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-felt-700 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
