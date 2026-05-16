const fs = require('fs');

// Patch no bundle principal main.js que e o arquivo executado pelo processo
// 'node dist/main' carrega dist/main.js
const fp = '/evolution/dist/main.js';

// Padrao original no main.js (usa (0,P.isJidGroup) pois nao foi minificado da mesma forma)
const old = 'n.exists&&!(0,P.isJidGroup)(n.jid)&&!n.jid.includes("@broadcast"))throw new f(n)';

// Bypass: nao lanca excecao para JIDs @lid (WhatsApp Privacy Mode / Linked Device ID)
// Para @lid, o Baileys consegue enviar diretamente usando o LID como identificador
const neu = 'n.exists&&!(0,P.isJidGroup)(n.jid)&&!n.jid.includes("@broadcast")&&!n.jid.includes("@lid"))throw new f(n)';

try {
  let content = fs.readFileSync(fp, 'utf-8');
  
  const count = (content.split(old).length - 1);
  console.log('Ocorrencias do padrao em main.js: ' + count);
  
  if (count === 0) {
    // Verificar se ja esta patchado
    const alreadyPatched = content.includes('"@lid"))throw new f(n)');
    console.log('SKIP: padrao nao encontrado. Ja patchado? ' + alreadyPatched);
    process.exit(alreadyPatched ? 0 : 1);
  }
  
  // Substitui apenas a primeira ocorrencia (sendMessageWithTyping - variavel 'n')
  const newContent = content.replace(old, neu);
  
  // Verifica que substituiu exatamente 1 vez
  const remaining = (newContent.split(old).length - 1);
  if (count - remaining !== 1) {
    console.log('ERRO: substituiu ' + (count - remaining) + ' ocorrencias (esperado 1)');
    process.exit(1);
  }
  
  fs.writeFileSync(fp, newContent, 'utf-8');
  console.log('PATCHED main.js: bypass @lid adicionado');
  
  // Confirmar resultado
  const verify = fs.readFileSync(fp, 'utf-8');
  console.log('Verificacao: @lid no codigo = ' + verify.includes('"@lid"))throw new f(n)'));
  process.exit(0);
} catch(e) {
  console.log('ERROR: ' + e.message);
  process.exit(1);
}
