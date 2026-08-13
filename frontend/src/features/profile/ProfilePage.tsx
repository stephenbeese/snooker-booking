import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
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
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="h-64 animate-pulse rounded-card bg-ink-100" />
      </div>
    );
  }

  if (!user) {
    return null; // RequireAuth is redirecting.
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-felt-900">Your account</h1>

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
    </div>
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
    <section className="mt-8 rounded-card border border-ink-200 bg-white p-6 shadow-card">
      <h2 className="font-semibold tracking-tight text-felt-900">Your details</h2>

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

        <div>
          <span className="block text-sm font-medium text-felt-900">Email address</span>
          <p className="mt-1.5 text-sm text-ink-600">{email}</p>
          {/* Not editable here: it is the login identifier and the address reset mail goes to,
              so changing it needs proof of the new mailbox. */}
          <p className="mt-1 text-xs text-ink-500">
            Contact the club if you need to change this.
          </p>
        </div>

        <Feedback
          error={update.error}
          success={isSubmitSuccessful && update.isSuccess ? 'Your details have been saved.' : null}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </section>
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
    <section className="mt-6 rounded-card border border-ink-200 bg-white p-6 shadow-card">
      <h2 className="font-semibold tracking-tight text-felt-900">Change password</h2>
      <p className="mt-1 text-sm text-ink-600">
        Changing your password signs you out on your other devices.
      </p>

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
    </section>
  );
}

function Feedback({ error, success }: { error: unknown; success: string | null }) {
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3">
        <p className="text-sm text-rose-800">
          {error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'}
        </p>
      </div>
    );
  }
  if (success) {
    return (
      <div role="status" className="rounded-lg border border-felt-200 bg-felt-50 p-3">
        <p className="text-sm text-felt-900">{success}</p>
      </div>
    );
  }
  return null;
}
