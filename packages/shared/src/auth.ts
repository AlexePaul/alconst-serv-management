/** Rolurile utilizatorilor interni. Valorile corespund enum-ului `UserRole` din Prisma. */
export const USER_ROLES = ['ADMIN', 'EMPLOYEE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  EMPLOYEE: 'Angajat',
};

/** Politica de parole – aplicată identic pe frontend și pe backend. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Utilizatorul așa cum este expus de API (fără date sensibile). */
export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
