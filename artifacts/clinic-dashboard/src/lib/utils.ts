import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

/**
 * Retorna true quando o "telefone" é na verdade um JID @lid (WhatsApp Privacy Mode).
 * Ex: "167933355495634@lid"
 */
export function isLidJid(phone: string): boolean {
  return phone.endsWith("@lid");
}

/**
 * Formata o telefone para exibição:
 * - JIDs @lid: retorna "WhatsApp Privacy"
 * - Números normais: formata no padrão +XX (XX) XXXXX-XXXX
 */
export function formatPhone(phone: string): string {
  if (isLidJid(phone)) return "WhatsApp Privacy";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length === 13) {
    // +55 (DDD) 9XXXX-XXXX
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith("55") && digits.length === 12) {
    // +55 (DDD) XXXX-XXXX
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}
