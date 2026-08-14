import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function checkIsSuperAdmin(usuario: any) {
  if (!usuario) return false;
  const role = String(usuario.role || '').toLowerCase();
  const email = String(usuario.email || '').toLowerCase();

  // Apenas a role explícita 'super_admin' ou o e-mail mestre do criador da plataforma
  const masterEmails = [
    'guiguigamer125@gmail.com',
  ];

  const isMasterEmail = masterEmails.includes(email);
  return role === 'super_admin' || isMasterEmail;
}

export function checkIsStoreAdmin(usuario: any) {
  if (!usuario) return false;
  const role = String(usuario.role || '').toLowerCase();
  return checkIsSuperAdmin(usuario) || role === 'admin' || role === 'gerente';
}

