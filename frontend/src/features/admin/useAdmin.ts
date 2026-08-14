import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { Role } from '@/features/auth/types';
import {
  createCafeCategory,
  createCafeItem,
  fetchCafeCategories,
  reorderCafeCategories,
  setCafeCategoryActive,
  updateCafeCategory,
  createTableType,
  deleteOpeningHoursOverride,
  fetchCafeItems,
  setCafeItemActive,
  updateCafeItem,
  fetchAdminTableTypes,
  fetchOpeningHoursOverrides,
  reorderTables,
  saveOpeningHoursOverride,
  setTableTypeActive,
  updateTableType,
  cancelBookingAsAdmin,
  changeUserRole,
  createAdminUser,
  createMaintenanceBlock,
  createTable,
  createTelephoneBooking,
  deleteMaintenanceBlock,
  deletePricingRule,
  fetchAdminBooking,
  fetchAdminBookings,
  fetchAdminDay,
  fetchAdminTables,
  fetchAdminUsers,
  fetchBookingRules,
  fetchClubDetails,
  fetchDashboard,
  fetchMaintenanceBlocks,
  fetchOpeningHours,
  fetchPricingRules,
  fetchTables,
  recordCounterPayment,
  fetchPaymentDecisions,
  answerPaymentDecision,
  savePricingRule,
  resetUserPassword,
  setTableActive,
  setUserActive,
  updateBookingRules,
  updateClubDetails,
  updateOpeningHours,
  updateTable,
} from './api';
import type {
  AdminBookingFilters,
  AdminUserFilters,
  CafeItemInput,
  CounterPaymentStatus,
  CreateUserInput,
  PricingRuleInput,
  TableInput,
} from './types';

export function useAdminDashboard() {
  return useQuery({
    queryKey: queryKeys.adminDashboard(),
    queryFn: fetchDashboard,
  });
}

/**
 * The filtered booking list.
 *
 * <p>`keepPreviousData` so changing a filter or turning a page does not blank the table and
 * collapse the layout for the duration of the request — the previous rows stay put and are
 * replaced when the new ones arrive.
 */
export function useAdminBookings(filters: AdminBookingFilters) {
  return useQuery({
    queryKey: queryKeys.adminBookings(filters),
    queryFn: () => fetchAdminBookings(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminBooking(reference: string) {
  return useQuery({
    queryKey: queryKeys.adminBooking(reference),
    queryFn: () => fetchAdminBooking(reference),
  });
}

export function useAdminDay(date: string) {
  return useQuery({
    queryKey: queryKeys.adminDay(date),
    queryFn: () => fetchAdminDay(date),
    placeholderData: keepPreviousData,
  });
}

export function useTables() {
  return useQuery({
    queryKey: queryKeys.tables(),
    queryFn: fetchTables,
  });
}

/**
 * Cancels a booking as staff.
 *
 * <p>Invalidates broadly on purpose. A cancellation changes the dashboard counts, every filtered
 * list that might contain the booking, and — because the slot is released — the availability
 * grid a customer is looking at. Invalidating only the one booking would leave staff staring at
 * a total that no longer adds up.
 */
export function useAdminTables() {
  return useQuery({
    queryKey: queryKeys.adminTables(),
    queryFn: fetchAdminTables,
  });
}

export function useMaintenanceBlocks(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.adminBlocks(from, to),
    queryFn: () => fetchMaintenanceBlocks(from, to),
    placeholderData: keepPreviousData,
  });
}

/**
 * Everything a table or block change invalidates.
 *
 * <p>Shared by all four mutations below because they all have the same reach: adding a table,
 * renaming one, taking one off sale or blocking one changes what the availability grid shows a
 * customer *right now*. Invalidating only the admin list would leave the grid advertising a
 * table that has just been withdrawn.
 */
function useInvalidateClubStructure() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] });
    await queryClient.invalidateQueries({ queryKey: ['availability'] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.tables() });
    // The public type list too. Renaming a type through the admin endpoint would otherwise
    // leave every grid and filter rendering the old label until its own long staleTime
    // expired — which is five minutes of staff seeing the change not take effect.
    await queryClient.invalidateQueries({ queryKey: queryKeys.tableTypes() });
  };
}

export function useCreateTable() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: createTable, onSuccess: invalidate });
}

export function useUpdateTable() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TableInput }) => updateTable(id, input),
    onSuccess: invalidate,
  });
}

export function useSetTableActive() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setTableActive(id, active),
    onSuccess: invalidate,
  });
}

export function useReorderTables() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: reorderTables, onSuccess: invalidate });
}

/** Every type including withdrawn ones. Admin-only; the pickers use `useTableTypes`. */
export function useAdminTableTypes() {
  return useQuery({
    queryKey: queryKeys.adminTableTypes(),
    queryFn: fetchAdminTableTypes,
  });
}

export function useCreateTableType() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({
    mutationFn: ({ label, displayOrder }: { label: string; displayOrder?: number }) =>
      createTableType(label, displayOrder),
    onSuccess: invalidate,
  });
}

export function useUpdateTableType() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({
    mutationFn: ({ code, label }: { code: string; label: string }) =>
      updateTableType(code, label),
    onSuccess: invalidate,
  });
}

export function useSetTableTypeActive() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) =>
      setTableTypeActive(code, active),
    onSuccess: invalidate,
  });
}

export function useOpeningHoursOverrides() {
  return useQuery({
    queryKey: queryKeys.adminOpeningHoursOverrides(),
    queryFn: fetchOpeningHoursOverrides,
  });
}

export function useSaveOpeningHoursOverride() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: saveOpeningHoursOverride, onSuccess: invalidate });
}

export function useDeleteOpeningHoursOverride() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: deleteOpeningHoursOverride, onSuccess: invalidate });
}

export function useCreateMaintenanceBlock() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: createMaintenanceBlock, onSuccess: invalidate });
}

export function useDeleteMaintenanceBlock() {
  const invalidate = useInvalidateClubStructure();
  return useMutation({ mutationFn: deleteMaintenanceBlock, onSuccess: invalidate });
}

/**
 * Takes a booking over the phone.
 *
 * <p>Invalidates the same set: a new booking removes a slot from the grid, and moves the
 * dashboard's counts and expected revenue.
 */
export function useCreateTelephoneBooking() {
  const invalidate = useInvalidateClubStructure();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTelephoneBooking,
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

// ---------------------------------------------------------------- settings

export function useClubDetails() {
  return useQuery({ queryKey: queryKeys.adminClubDetails(), queryFn: fetchClubDetails });
}

export function useOpeningHours() {
  return useQuery({ queryKey: queryKeys.adminOpeningHours(), queryFn: fetchOpeningHours });
}

export function useBookingRules() {
  return useQuery({ queryKey: queryKeys.adminBookingRules(), queryFn: fetchBookingRules });
}

export function usePricingRules() {
  return useQuery({ queryKey: queryKeys.adminPricingRules(), queryFn: fetchPricingRules });
}

/**
 * Club contact details.
 *
 * <p>Invalidates `['club']` as well: the public club page and the site footer render this, so
 * leaving them cached would show staff the old address on the very page they just edited.
 */
export function useUpdateClubDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateClubDetails,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminClubDetails() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.club() });
    },
  });
}

export function useUpdateOpeningHours() {
  const invalidate = useInvalidateClubStructure();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOpeningHours,
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: queryKeys.club() });
    },
  });
}

export function useUpdateBookingRules() {
  const invalidate = useInvalidateClubStructure();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateBookingRules,
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: queryKeys.club() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookingSettings() });
    },
  });
}

export function useSavePricingRule() {
  const invalidate = useInvalidateClubStructure();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: PricingRuleInput }) =>
      savePricingRule(id, input),
    onSuccess: async () => {
      await invalidate();
      // The "from £x per hour" headline on the public page comes from these rules.
      await queryClient.invalidateQueries({ queryKey: queryKeys.club() });
    },
  });
}

export function useDeletePricingRule() {
  const invalidate = useInvalidateClubStructure();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePricingRule,
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: queryKeys.club() });
    },
  });
}

export function useAdminCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reference, reason }: { reference: string; reason?: string }) =>
      cancelBookingAsAdmin(reference, reason),
    onSuccess: async (booking) => {
      queryClient.setQueryData(queryKeys.adminBooking(booking.reference), booking);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      // The customer's own view of this booking is now wrong too.
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

/**
 * Records a counter payment, or waives it.
 *
 * <p>Writes the returned booking straight into the detail cache so the badge clears without a
 * refetch — staff are standing at the till with a customer in front of them, and a spinner
 * between "paid" and the screen agreeing is the moment they take the money twice.
 *
 * <p>Still invalidates the lists: the same booking is on screen elsewhere with a "due" badge,
 * and the dashboard counts change.
 */
export function useRecordCounterPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reference, status }: { reference: string; status: CounterPaymentStatus }) =>
      recordCounterPayment(reference, status),
    onSuccess: async (booking) => {
      queryClient.setQueryData(queryKeys.adminBooking(booking.reference), booking);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

// ------------------------------------------------------- payment decisions

export function usePaymentDecisions() {
  return useQuery({
    queryKey: queryKeys.adminPaymentDecisions(),
    queryFn: fetchPaymentDecisions,
  });
}

/**
 * Answers one decision, by refunding it or by recording it as settled elsewhere.
 *
 * <p>Invalidates the whole admin tree rather than just this list: answering a decision changes
 * the dashboard's count and the booking's own payment status, and a stale count is precisely
 * the thing this screen exists to stop.
 */
export function useAnswerPaymentDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'refund' | 'resolve' }) =>
      answerPaymentDecision(id, action),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

// -------------------------------------------------------------- customers

// ---------------------------------------------------------------- accounts

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: queryKeys.adminUsers(filters),
    queryFn: () => fetchAdminUsers(filters),
    // Keeps the current page on screen while a new search resolves, so typing does not
    // flash an empty table between keystrokes.
    placeholderData: keepPreviousData,
  });
}

/**
 * Every account mutation invalidates the whole directory rather than patching one row.
 *
 * <p>A role change can alter more than the row it targets — the "last admin" rule means the
 * server may refuse a later change that the client would have thought fine — so refetching
 * keeps the screen honest about what is now permitted.
 */
function useUserMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // The acting admin may have changed their own standing, and the header reads role
      // from here to decide which links to show.
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser() });
    },
  });
}

export function useCreateAdminUser() {
  return useUserMutation((input: CreateUserInput) => createAdminUser(input));
}

export function useChangeUserRole() {
  return useUserMutation(({ id, role }: { id: number; role: Role }) => changeUserRole(id, role));
}

export function useSetUserActive() {
  return useUserMutation(({ id, active }: { id: number; active: boolean }) =>
    setUserActive(id, active),
  );
}

export function useResetUserPassword() {
  return useUserMutation(({ id, password }: { id: number; password: string }) =>
    resetUserPassword(id, password),
  );
}

// -------------------------------------------------------------- cafe / bar

export function useCafeItems() {
  return useQuery({ queryKey: queryKeys.adminCafeItems(), queryFn: fetchCafeItems });
}

/**
 * Every menu mutation invalidates the menu, and nothing else.
 *
 * <p>Deliberately not `useInvalidateClubStructure`: the cafe changes nothing about what tables
 * exist or what is bookable, so sweeping it into that group would refetch availability every
 * time a price moved — and refetch the menu every time a table was renamed.
 */
function useCafeMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCafeItems() });
      // The customer-facing menu renders the same items. Without this an admin who corrects a
      // price sees it change on the editor and not on /menu, for the five minutes that page's
      // staleTime holds — and would reasonably conclude the save had not worked.
      await queryClient.invalidateQueries({ queryKey: queryKeys.menu() });
    },
  });
}

export function useCreateCafeItem() {
  return useCafeMutation((input: CafeItemInput) => createCafeItem(input));
}

export function useUpdateCafeItem() {
  return useCafeMutation(({ id, input }: { id: number; input: CafeItemInput }) =>
    updateCafeItem(id, input),
  );
}

export function useSetCafeItemActive() {
  return useCafeMutation(({ id, active }: { id: number; active: boolean }) =>
    setCafeItemActive(id, active),
  );
}

/** Every category including withdrawn ones. Admin-only; the item picker uses the active ones. */
export function useCafeCategories() {
  return useQuery({ queryKey: queryKeys.adminCafeCategories(), queryFn: fetchCafeCategories });
}

/**
 * Category mutations invalidate the categories, the items and the public menu.
 *
 * <p>All three, because a rename changes the heading every item is filed under: leaving the item
 * list alone would show staff the new category name in one panel and the old one beside it.
 */
function useCafeCategoryMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCafeCategories() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminCafeItems() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.menu() });
    },
  });
}

export function useCreateCafeCategory() {
  return useCafeCategoryMutation(({ label }: { label: string }) => createCafeCategory(label));
}

export function useUpdateCafeCategory() {
  return useCafeCategoryMutation(({ code, label }: { code: string; label: string }) =>
    updateCafeCategory(code, label),
  );
}

export function useReorderCafeCategories() {
  return useCafeCategoryMutation(reorderCafeCategories);
}

export function useSetCafeCategoryActive() {
  return useCafeCategoryMutation(({ code, active }: { code: string; active: boolean }) =>
    setCafeCategoryActive(code, active),
  );
}
