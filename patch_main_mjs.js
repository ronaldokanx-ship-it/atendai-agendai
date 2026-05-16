const fs = require('fs');

const fp = '/evolution/dist/main.mjs';

// Padrao no bundle real (main.mjs) - variavel minificada 'xe' ao inves de 'P.isJidGroup'
// Esta e a verificacao em sendMessageWithTyping para o parametro 'n' (numero do destinatario)
const old = 'exists&&!xe(n.jid)&&!n.jid.includes("@broadcast"))throw new f(n)';

// Bypass: nao lanca excecao para JIDs @lid (WhatsApp Privacy Mode)
// Baileys suporta envio direto para @lid JIDs internamente
const neu = 'exists&&!xe(n.jid)&&!n.jid.includes("@broadcast")&&!n.jid.includes("@lid"))throw new f(n)';

try {
  let content = fs.readFileSync(fp, 'utf-8');
  
  const count = (content.split(old).length - 1);
  console.log('Ocorrencias do padrao: ' + count);
  
  if (count === 0) {
    console.log('SKIP: padrao nao encontrado em ' + fp);
    process.exit(1);
  }
  
  // Substitui apenas a PRIMEIRA ocorrencia (sendMessageWithTyping com variavel 'n')
  // As outras ocorrencias sao de outros metodos que usam 's' (sendPresence etc)
  const newContent = content.replace(old, neu);
  fs.writeFileSync(fp, newContent, 'utf-8');
  
  // Verifica que substituiu apenas 1
  const remaining = (newContent.split(old).length - 1);
  console.log('PATCHED: ' + fp + ' (' + (count - remaining) + ' substituicao(oes))');
  process.exit(0);
} catch(e) {
  console.log('ERROR: ' + e.message);
  process.exit(1);
}
