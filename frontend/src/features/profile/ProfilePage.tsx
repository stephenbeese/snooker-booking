import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageShell } from '@/components/ui/PageShell';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useCurrentUser } from '@/features/auth/useAuth';
import { ApiError } from '@/lib/apiError';
import { useChangePassword, useUpdateProfile } from './useProfile';

const detailsSchema = z.object({
  firstName: z.string().min(1, 'Enter your first name').max(100),
  lastName: z.string().min(1, 'Enter your last name').max(100),
  phone: z.string().regex(/^$|^[0-9 +()-]{7,20}$/, 'Enter a valid phone number'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(12, 'Use at least 12 characters').max(72),
    confirmPassword: z.string(),
  })
  // Checked here purely to catch a typo before a round trip. The server never sees this field
  // and never relies on it.
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });

type DetailsValues = z.infer<typeof detailsSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) {
    return (
      <PageShell width="sm">
        <Skeleton className="h-64" label="Loading your profile" />
      </PageShell>
    );
  }

  if (!user) {
    return null; // RequireAuth is redirecting.
  }

  return (
    <PageShell width="sm">
      {/* An identity block rather than a bare heading. The page is reached from a nav link
          labelled with the person's own first name, so it has to say plainly whose profile
          this is and what is on it — otherwise "Your account" over two forms leaves people
          wondering what else was meant to be here. */}
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-felt-100 text-xl font-semibold text-felt-900"
        >
          {user.firstName.charAt(0).toUpperCase()}
          {user.lastName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-felt-900 sm:text-3xl">
            {user.firstName} {user.lastName}
          </h1>
          <p className="truncate text-sm text-fg-muted">{user.email}</p>
        </div>
      </div>

      <p className="mt-6 text-sm text-fg-muted">
        Your contact details and password.{' '}
        <Link
          to="/bookings"
          className="font-medium text-felt-800 underline underline-offset-2 hover:text-felt-900"
        >
          Your bookings
        </Link>{' '}
        are on their own page.
      </p>

      <DetailsCard
        key={user.id}
        defaults={{
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone ?? '',
        }}
        email={user.email}
      />
      <PasswordCard />
    </PageShell>
  );
}

function DetailsCard({ defaults, email }: { defaults: DetailsValues; email: string }) {
  const update = useUpdateProfile();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<DetailsValues>({ resolver: zodResolver(detailsSchema), defaultValues: defaults });

  async function onSubmit(values: DetailsValues) {
    try {
      await update.mutateAsync(values);
    } catch {
      // Rendered below.
    }
  }

  return (
    <Panel title="Your details" className="mt-8">
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
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
          label="Phone number"
          type="tel"
          autoComplete="tel"
          hint="So the club can reach you about a booking"
          error={errors.phone?.message}
          {...register('phone')}
        />

        <div className="rounded-lg bg-surface-sunken px-3.5 py-3">
          <span className="block text-sm font-medium text-felt-900">Email address</span>
          <p className="mt-1 text-sm text-fg-muted">{email}</p>
          {/* Not editable here: it is the login identifier and the address reset mail goes to,
              so changing it needs proof of the new mailbox. */}
          <p className="mt-1 text-xs text-ink-500">Contact the club if you need to change this.</p>
        </div>

        <Feedback
          error={update.error}
          success={isSubmitSuccessful && update.isSuccess ? 'Your details have been saved.' : null}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </Panel>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  async function onSubmit(values: PasswordValues) {
    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // Clear the fields on success: leaving a password sitting in a form on a shared screen
      // is exactly what the feature is meant to protect against.
      reset();
    } catch {
      // Rendered below.
    }
  }

  return (
    <Panel
      title="Change password"
      description="Changing your password signs you out on your other devices."
      className="mt-6"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
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

        <Feedback
          error={change.error}
          success={change.isSuccess ? 'Your password has been changed.' : null}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Panel>
  );
}

function Feedback({ error, success }: { error: unknown; success: string | null }) {
  if (error) {
    return (
      <Alert tone="danger">
        {error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'}
      </Alert>
    );
  }
  if (success) {
    return <Alert tone="success">{success}</Alert>;
  }
  return null;
}
