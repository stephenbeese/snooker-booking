export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

/** Does this person work here? The question almost every staff screen is really asking. */
export function isStaff(role: Role): boolean {
  return role !== 'CUSTOMER';
}

/** Only for the club's own configuration: settings, pricing, tables, accounts. */
export function isAdmin(role: Role): boolean {
  return role === 'ADMIN';
}

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}
