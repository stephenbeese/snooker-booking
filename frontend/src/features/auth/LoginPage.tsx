import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { useLogin } from './useAuth';

// Deliberately minimal: no email-format or length rules. The server answers a bad email and a
// wrong password identically, and a client-side format error would tell an attacker which
// addresses are even worth trying.
const schema = z.object({
  email: z.string().min(1, 'Enter your email address'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Where the user was heading before being asked to sign in.
  const state = location.state as { from?: string; passwordReset?: boolean } | null;
  const redirectTo = state?.from ?? '/book';
  const justReset = state?.passwordReset === true;

  async function onSubmit(values: FormValues) {
    try {
      await loginMutation.mutateAsync(values);
      navigate(redirectTo, { replace: true });
    } catch {
      // Rendered from the mutation's error state below.
    }
  }

  const errorMessage =
    loginMutation.error instanceof ApiError
      ? loginMutation.error.message
      : loginMutation.error
        ? 'Could not sign in. Please try again.'
        : null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-card border border-ink-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Sign in</h1>
        <p className="mt-2 text-sm text-ink-600">Welcome back. Sign in to manage your bookings.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          {justReset && !errorMessage && (
            <div role="status" className="rounded-lg border border-felt-200 bg-felt-50 p-3">
              <p className="text-sm text-felt-900">
                Your password has been changed. Please sign in with it.
              </p>
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-800">{errorMessage}</p>
            </div>
          )}

          <TextField
            label="Email address"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm">
          <Link to="/forgot-password" className="text-ink-600 underline underline-offset-2 hover:text-felt-800">
            Forgot your password?
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-sm text-ink-600">
        No account?{' '}
        <Link to="/register" className="font-medium text-felt-700 underline underline-offset-2">
          Create one
        </Link>
      </p>
    </div>
  );
}
