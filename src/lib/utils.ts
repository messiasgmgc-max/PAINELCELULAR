import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function checkIsSuperAdmin(usuario: any) {
  if (!usuario) return false;
  const role = String(usuario.role || '').toLowerCase();
  const email = String(usuario.email || '').toLowerCase();

  // Apenas super_admin oficial da plataforma ou e-mails mestres do Phone Center
  const masterEmails = [
    'guiguigamer125@gmail.com',
    'lucasimports031@gmail.com',
    'messiasgmgc@gmail.com',
  ];

  const isMasterEmail = masterEmails.some(
    (master) => email === master || email.includes('guiguigamer125') || email.includes('lucasimports031')
  );
  return role === 'super_admin' || isMasterEmail;
}

export function checkIsStoreAdmin(usuario: any) {
  if (!usuario) return false;
  const role = String(usuario.role || '').toLowerCase();
  return checkIsSuperAdmin(usuario) || role === 'admin' || role === 'gerente';
}

