/**
 * Auto-Handoff: detecta quando o paciente está pedindo para falar com um atendente humano.
 * Usado pelos webhooks Evolution API e Meta Cloud API quando `clinic.autoHandoffEnabled = true`.
 */

/**
 * Remove acentos e normaliza o texto para comparação de padrões.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");
}

/**
 * Frases que indicam que o paciente quer falar com um atendente humano.
 * Escritas sem acentos para facilitar a comparação após normalização.
 */
const HUMAN_REQUEST_PHRASES: string[] = [
  "falar com atendente",
  "falar com um atendente",
  "falar com humano",
  "falar com um humano",
  "falar com alguem",
  "falar com uma pessoa",
  "falar com pessoa real",
  "falar com funcionario",
  "falar com responsavel",
  "falar com gerente",
  "falar com supervisor",
  "atendente humano",
  "atendimento humano",
  "pessoa real",
  "ser humano",
  "quero atendente",
  "quero um atendente",
  "preciso de atendente",
  "preciso falar com",
  "me transfere",
  "me passa para",
  "transferir para atendente",
  "chamar atendente",
  "chamar um atendente",
  "quero falar com alguem",
  "atendimento presencial",
  "ligar para a clinica",
  "falar com secretaria",
  "falar com secretario",
  "falar com recepcao",
  "falar com recepcionista",
];

/**
 * Retorna `true` se o texto do paciente contém alguma indicação de que ele quer
 * ser atendido por um humano.
 */
export function detectsHumanRequest(text: string): boolean {
  const normalized = normalize(text);
  return HUMAN_REQUEST_PHRASES.some((phrase) => normalized.includes(phrase));
}
