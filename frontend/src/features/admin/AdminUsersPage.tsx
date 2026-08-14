import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useCurrentUser } from '@/features/auth/useAuth';
import type { Role } from '@/features/auth/types';
import { ApiError } from '@/lib/apiError';
import {
  useAdminUsers,
  useChangeUserRole,
  useCreateAdminUser,
  useResetUserPassword,
  useSetUserActive,
} from './useAdmin';
import type { AdminUser } from './types';

/**
 * What each role means, in the words someone deciding between them needs.
 *
 * <p>Deliberately describing capability rather than naming the role again: "Staff" tells an
 * admin nothing about whether that person will be able to change the club's prices.
 */
const ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: 'CUSTOMER',
    label: 'Customer',
    description: 'Books and manages their own tables. No access to the staff area.',
  },
  {
    value: 'STAFF',
    label: 'Staff',
    description:
      'Takes bookings over the phone, cancels and amends any booking, marks tables out for maintenance.',
  },
  {
    value: 'ADMIN',
    label: 'Manager',
    description:
      'Everything staff can do, plus opening hours, pricing, tables and these accounts.',
  },
];

const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Customer',
  STAFF: 'Staff',
  ADMIN: 'Manager',
};

const createSchema = z.object({
  email: z.email('Enter a valid email address').max(254),
  // 12–72 matches the server exactly, including the upper bound: BCrypt truncates beyond 72
  // bytes, which would make two different long passwords interchangeable.
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(72, 'Use at most 72 characters'),
  firstName: z.string().min(1, 'Enter their first name').max(100),
  lastName: z.string().min(1, 'Enter their last name').max(100),
  phone: z.string().regex(/^$|^[0-9 +()-]{7,20}$/, 'Enter a valid phone number'),
  role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']),
});

type CreateFormValues = z.input<typeof createSchema>;

/**
 * Who has access to the club, and at what level.
 *
 * <p>Manager-only, both here and — the part that matters — in `SecurityConfig`. A staff member
 * who could reach this screen could grant themselves the club's configuration, so the server
 * refuses `/api/admin/users/**` to anyone but an admin regardless of what renders.
 *
 * <p>Accounts are created with a password the admin sets and passes on, rather than an emailed
 * invitation: the club's outbound mail is a development stub, and an invite flow would mean a
 * new starter cannot sign in until mail delivery is configured. The person changes it from
 * their own profile afterwards.
 */
export function AdminUsersPage() {
  const { data: currentUser } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [resettingFor, setResettingFor] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = {
    ...(roleFilter !== '' ? { role: roleFilter } : {}),
    ...(search.trim() !== '' ? { search: search.trim() } : {}),
  };
  const { data, isPending, isError, error } = useAdminUsers(filters);

  const createUser = useCreateAdminUser();
  const changeRole = useChangeUserRole();
  const setActive = useSetUserActive();
  const resetPassword = useResetUserPassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { phone: '', role: 'STAFF' },
  });

  /** The server's message is the useful one — it explains *which* rule refused the change. */
  function describe(caught: unknown, fallback: string): string {
    return caught instanceof ApiError ? caught.message : fallback;
  }

  async function onCreate(values: CreateFormValues) {
    setActionError(null);
    try {
      const created = await createUser.mutateAsync({
        email: values.email.trim(),
        password: values.password,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim(),
        role: values.role,
      });
      setNotice(
        `${created.fullName} can now sign in as ${ROLE_LABEL[created.role].toLowerCase()}. Give them the password you set — they can change it from their profile.`,
      );
      setShowCreate(false);
      reset({ phone: '', role: 'STAFF' });
    } catch (caught) {
      setActionError(describe(caught, 'Could not create that account.'));
    }
  }

  async function onChangeRole(user: AdminUser, role: Role) {
    setActionError(null);
    setNotice(null);
    try {
      await changeRole.mutateAsync({ id: user.id, role });
      setNotice(`${user.fullName} is now ${ROLE_LABEL[role].toLowerCase()}.`);
    } catch (caught) {
      // The server refuses self-demotion and removing the club's last manager. Both are
      // states the client could have predicted but must not enforce alone.
      setActionError(describe(caught, 'Could not change that role.'));
    }
  }

  async function onToggleActive(user: AdminUser) {
    setActionError(null);
    setNotice(null);
    try {
      await setActive.mutateAsync({ id: user.id, active: !user.active });
      setNotice(
        user.active
          ? `${user.fullName} can no longer sign in.`
          : `${user.fullName} can sign in again.`,
      );
    } catch (caught) {
      setActionError(describe(caught, 'Could not change that account.'));
    }
  }

  async function onResetPassword() {
    if (!resettingFor) {
      return;
    }
    setActionError(null);
    if (newPassword.length < 12) {
      setActionError('Use at least 12 characters.');
      return;
    }
    try {
      await resetPassword.mutateAsync({ id: resettingFor.id, password: newPassword });
      setNotice(`Password set for ${resettingFor.fullName}. Give it to them directly.`);
      setResettingFor(null);
      setNewPassword('');
    } catch (caught) {
      setActionError(describe(caught, 'Could not set that password.'));
    }
  }

  const users = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-felt-900">People</h1>
          <p className="mt-2 text-sm text-ink-600">
            Who can sign in, and what they are allowed to do.
          </p>
        </div>
        <Button onClick={() => setShowCreate((open) => !open)}>
          {showCreate ? 'Cancel' : 'Add someone'}
        </Button>
      </header>

      {notice && (
        <p
          role="status"
          className="mt-6 rounded-card border border-felt-200 bg-felt-50 p-4 text-sm text-felt-900"
        >
          {notice}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="mt-6 rounded-card border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {actionError}
        </p>
      )}

      {showCreate && (
        <form
          onSubmit={handleSubmit(onCreate)}
          className="mt-6 space-y-5 rounded-card border border-ink-200 bg-white p-6 shadow-card"
          noValidate
        >
          <h2 className="text-lg font-semibold text-felt-900">New account</h2>
          <p className="text-sm text-ink-600">
            Set a password and pass it on directly. They can change it from their own profile
            once they have signed in.
          </p>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="First name"
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <TextField
              label="Last name"
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>
          <TextField
            label="Email address"
            type="email"
            hint="This is what they sign in with."
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Phone number"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="Password"
            type="password"
            hint="At least 12 characters."
            error={errors.password?.message}
            {...register('password')}
          />

          <fieldset>
            <legend className="text-sm font-medium text-felt-900">Access level</legend>
            <div className="mt-2 space-y-2">
              {ROLES.map((role) => (
                <label
                  key={role.value}
                  className="flex gap-3 rounded-lg border border-ink-200 p-3 text-sm"
                >
                  <input
                    type="radio"
                    value={role.value}
                    className="mt-1"
                    {...register('role')}
                  />
                  <span>
                    <span className="block font-medium text-felt-900">{role.label}</span>
                    <span className="block text-ink-600">{role.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create account'}
          </Button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap items-end gap-4">
        <div className="grow sm:max-w-xs">
          <label htmlFor="userSearch" className="block text-sm font-medium text-felt-900">
            Search
          </label>
          <input
            id="userSearch"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email"
            className="mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="roleFilter" className="block text-sm font-medium text-felt-900">
            Access level
          </label>
          <select
            id="roleFilter"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as Role | '')}
            className="mt-1.5 block rounded-lg bg-white px-3.5 py-2.5 text-sm text-ink-900 ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
          >
            <option value="">Everyone</option>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6" aria-live="polite" aria-busy={isPending}>
        {isError && (
          <p role="alert" className="rounded-card border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error.message}
          </p>
        )}

        {data && users.length === 0 && (
          <p className="rounded-card border border-dashed border-ink-300 bg-ink-50 p-8 text-center text-sm text-ink-600">
            Nobody matches that search.
          </p>
        )}

        {users.length > 0 && (
          <div className="overflow-x-auto rounded-card border border-ink-200 bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Accounts and their access levels</caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">Access</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <tr key={user.id} className="border-b border-ink-100 last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-medium text-felt-900">{user.fullName}</span>
                        {isSelf && <span className="ml-2 text-xs text-ink-500">(you)</span>}
                        {!user.active && (
                          <span className="ml-2 rounded bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">
                            Cannot sign in
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-700">{user.email}</td>
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`role-${user.id}`}>
                          Access level for {user.fullName}
                        </label>
                        <select
                          id={`role-${user.id}`}
                          value={user.role}
                          // Disabled on your own row: the server refuses self-demotion, and
                          // offering a control that always fails is worse than not offering it.
                          disabled={isSelf}
                          onChange={(event) => void onChangeRole(user, event.target.value as Role)}
                          className="rounded-lg bg-white px-2.5 py-1.5 text-sm ring-1 ring-inset ring-ink-300 disabled:bg-ink-50 disabled:text-ink-500"
                        >
                          {ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="mr-3 text-sm text-felt-700 underline underline-offset-2"
                          onClick={() => {
                            setResettingFor(user);
                            setNewPassword('');
                          }}
                        >
                          Set password
                        </button>
                        <button
                          type="button"
                          disabled={isSelf}
                          className="text-sm text-felt-700 underline underline-offset-2 disabled:text-ink-400 disabled:no-underline"
                          onClick={() => void onToggleActive(user)}
                        >
                          {user.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resettingFor && (
        <div className="mt-6 rounded-card border border-ink-200 bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-felt-900">
            Set a password for {resettingFor.fullName}
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            For someone who has forgotten theirs. Give the new one to them directly.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="grow sm:max-w-xs">
              <label htmlFor="newPassword" className="block text-sm font-medium text-felt-900">
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1.5 block w-full rounded-lg bg-white px-3.5 py-2.5 text-sm ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-inset focus:ring-felt-600 focus:outline-none"
              />
            </div>
            <Button onClick={() => void onResetPassword()}>Set password</Button>
            <button
              type="button"
              className="text-sm text-ink-600 underline underline-offset-2"
              onClick={() => setResettingFor(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
