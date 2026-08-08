import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function checkIsSuperAdmin(usuario: any) {
  if (!usuario) return false;
  const role = String(usuario.role || '').toLowerCase();
  const email = String(usuario.email || '').toLowerCase();

  const superAdminKeywords = [
    'lucas',
    'guigui',
    'guiguigamer125',
    'admin',
    'messias',
    'superadmin',
  ];

  const isMasterEmail = superAdminKeywords.some((keyword) => email.includes(keyword));
  return role === 'super_admin' || role === 'admin' || isMasterEmail;
}

