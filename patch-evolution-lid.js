/**
 * patch-evolution-lid.js
 *
 * Aplica o bypass de WhatsApp Privacy Mode (@lid) na Evolution API.
 *
 * Problema: o Baileys retorna { exists: false } para JIDs @lid porque
 * os servidores do WhatsApp não expõem o número real via onWhatsApp().
 * Sem este patch, a Evolution API lança BadRequestException ao tentar
 * enviar mensagens para usuários com Privacy Mode ativo.
 *
 * Solução: adiciona &&!n.jid.includes("@lid") à verificação de existência
 * no método sendMessageWithTyping (e outros métodos similares), permitindo
 * o envio sem verificar existência para JIDs @lid.
 *
 * NOTA: o main.js original já contém .includes("@lid") em funções de
 * normalização de JID — por isso a detecção "já aplicado" usa uma string
 * específica do nosso patch: @broadcast")&&!n.jid.includes("@lid")
 *
 * Uso: node patch-evolution-lid.js [--file /path/to/main.js]
 */

const fs = require("fs");

const filePath = (() => {
  const idx = process.argv.indexOf("--file");
  return idx !== -1 ? process.argv[idx + 1] : "/evolution/dist/main.js";
})();

if (!fs.existsSync(filePath)) {
  console.error(`Arquivo não encontrado: ${filePath}`);
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");

// DETECÇÃO ÚNICA: string que SÓ existe após aplicar o patch.
// O código original tem .includes("@lid") para normalização, mas NÃO tem
// essa combinação específica de @broadcast + @lid numa condição de throws.
const PATCH_MARKER = '@broadcast")&&!n.jid.includes("@lid")';
if (src.includes(PATCH_MARKER)) {
  const count = (src.match(/includes\("@lid"\)/g) || []).length;
  console.log(`Patch @lid já aplicado (${count} ocorrência(s)) — nenhuma alteração necessária.`);
  process.exit(0);
}

let patched = src;
let patchCount = 0;

// ─── Padrão A: sendMessageWithTyping e métodos similares ─────────────────────
// Formato: !n.exists&&!(0,X.isJidGroup)(n.jid)&&!n.jid.includes("@broadcast"))throw new f(n)
// Adiciona: &&!n.jid.includes("@lid") antes do )throw
const PATTERN_A = /(!n\.exists&&!\(0,[A-Za-z$_.]+\)\(n\.jid\)&&!n\.jid\.includes\("@broadcast"\))\)throw new ([A-Za-z$_]+\(n\))/g;
const result_A = patched.replace(PATTERN_A, (match, g1, g2) => {
  patchCount++;
  return `${g1}&&!n.jid.includes("@lid"))throw new ${g2}`;
});
if (result_A !== patched) {
  patched = result_A;
}

// ─── Padrão B: variante sem (0,fn) wrapper ────────────────────────────────────
// Formato: !n.exists&&!isJidGroup(n.jid)&&!n.jid.includes("@broadcast"))throw new f(n)
const PATTERN_B = /(!n\.exists&&![A-Za-z$_.]+\(n\.jid\)&&!n\.jid\.includes\("@broadcast"\))\)throw new ([A-Za-z$_]+\(n\))/g;
const result_B = patched.replace(PATTERN_B, (match, g1, g2) => {
  patchCount++;
  return `${g1}&&!n.jid.includes("@lid"))throw new ${g2}`;
});
if (result_B !== patched) {
  patched = result_B;
}

// ─── Padrão C: variante com variável diferente de n (ex: s, o) ───────────────
// Formato: !s.exists&&!(0,X.isJidGroup)(s.jid)&&!s.jid.includes("@broadcast"))throw new f(s)
const PATTERN_C = /(!([a-z])\.exists&&!\(0,[A-Za-z$_.]+\)\(\2\.jid\)&&!\2\.jid\.includes\("@broadcast"\))\)throw new ([A-Za-z$_]+\(\2\))/g;
const result_C = patched.replace(PATTERN_C, (match, g1, varName, g3) => {
  // Só aplica se não for 'n' (já tratado pelos padrões A e B)
  if (varName === 'n') return match;
  patchCount++;
  return `${g1}&&!${varName}.jid.includes("@lid"))throw new ${g3}`;
});
if (result_C !== patched) {
  patched = result_C;
}

if (patchCount === 0) {
  console.error("PATCH FALHOU — nenhum padrão encontrado no arquivo.");
  console.error("Verifique a versão da Evolution API e atualize os padrões em patch-evolution-lid.js.");
  process.exit(1);
}

fs.writeFileSync(filePath, patched);

// Verifica aplicação do marcador único
const verify = fs.readFileSync(filePath, "utf8");
if (!verify.includes(PATCH_MARKER)) {
  console.error("PATCH FALHOU — arquivo gravado mas marcador não encontrado. Verifique manualmente.");
  process.exit(1);
}

const lidCount = (verify.match(/includes\("@lid"\)/g) || []).length;
console.log(`Patch @lid aplicado com sucesso: ${patchCount} padrão(ões) corrigido(s), ${lidCount} ocorrência(s) de @lid no arquivo.`);
