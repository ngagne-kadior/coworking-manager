export type AppRole = "admin" | "manager";

export type Account = {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  is_me: boolean;
};

export const MIN_PASSWORD_LENGTH = 10;

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
};

export function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "manager";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function passwordProblem(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  return null;
}
