import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/apiError';
import { useLogin, useRegister } from './useAuth';

/**
 * Mirrors the server's rules so the user is told before a round trip. The server enforces them
 * again regardless — this is a convenience, never the control.
 */
const schema = z.object({
  email: z.email('Enter a valid email address').max(254),
  password: z
    .string()
    // Length over character classes: composition rules mostly produce "Password1!".
    .min(12, 'Use at least 12 characters')
    // BCrypt silently truncates beyond 72 bytes, which would make two different long
    // passwords interchangeable.
    .max(72, 'Use no more than 72 characters'),
  firstName: z.string().min(1, 'Enter your first name').max(100),
  lastName: z.string().min(1, 'Enter your last name').max(100),
  // Not .optional(): the field is always present in the form, empty string meaning "not
  // given". Making the schema optional as well would give the resolver differing input and
  // output types, which exactOptionalPropertyTypes rejects.
  phone: z.string().regex(/^$|^[0-9 +()-]{7,20}$/, 'Enter a valid phone number'),
});

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const loginMutation = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { phone: '' } });

  async function onSubmit(values: FormValues) {
    try {
      await registerMutation.mutateAsync(values);
      // Signing in immediately: making someone type the password they just chose, on the very
      // next screen, is friction with no security benefit.
      await loginMutation.mutateAsync({ email: values.email, password: values.password });
      navigate('/book', { replace: true });
    } catch {
      // Rendered from the mutation error state below.
    }
  }

  const error = registerMutation.error ?? loginMutation.error;
  const errorMessage =
    error instanceof ApiError
      ? error.message
      : error
        ? 'Could not create your account. Please try again.'
        : null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-card border border-ink-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight text-felt-900">Create an account</h1>
        <p className="mt-2 text-sm text-ink-600">You need an account to book a table.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
          {errorMessage && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm text-rose-800">{errorMessage}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextField
              label="First name"
              autoComplete="given-name"
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <TextField
              label="Last name"
              autoComplete="family-name"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>

          <TextField
            label="Email address"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Phone number"
            type="tel"
            autoComplete="tel"
            hint="Optional — so the club can reach you about your booking"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 12 characters"
            error={errors.password?.message}
            {...register('password')}
          />

          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-felt-700 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
