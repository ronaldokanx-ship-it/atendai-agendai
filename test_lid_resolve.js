// Testa endpoints da Evolution API para descobrir se é possível
// resolver um JID @lid para o número de telefone real
const http = require('http');

const API_KEY = 'HC8WnTpG+xQiBYqSzac3SfrTWEfBdNMIJHx45dTMJ8I=';
const INSTANCE = 'clinica-1';
const LID = '167933355495634@lid';

function req(method, path, body, label) {
  return new Promise((resolve) => {
    const d = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 8080, path, method,
      headers: { 'Content-Type': 'application/json', 'apikey': API_KEY }
    };
    if (d) opts.headers['Content-Length'] = Buffer.byteLength(d);
    const r = http.request(opts, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        console.log('\n=== ' + label + ' (' + res.statusCode + ') ===');
        try { console.log(JSON.stringify(JSON.parse(b), null, 2).slice(0, 1200)); }
        catch { console.log(b.slice(0, 800)); }
        resolve(b);
      });
    });
    r.on('error', e => { console.log('[' + label + '] ERROR: ' + e.message); resolve(''); });
    if (d) r.write(d);
    r.end();
  });
}

async function main() {
  // 1. findContacts com filtro de LID
  await req('POST', `/chat/findContacts/${INSTANCE}`, { where: { id: LID } }, 'findContacts by LID');

  // 2. findContacts listando todos (primeiros)
  await req('POST', `/chat/findContacts/${INSTANCE}`, {}, 'findContacts all (first)');

  // 3. findChats - busca chat pelo JID
  await req('POST', `/chat/findChats/${INSTANCE}`, { where: { remoteJid: LID } }, 'findChats by LID');

  // 4. findMessages - mensagens do LID
  await req('POST', `/chat/findMessages/${INSTANCE}`, { where: { key: { remoteJid: LID } } }, 'findMessages by LID');

  // 5. profile do LID
  await req('GET', `/chat/fetchProfile/${INSTANCE}/${LID}`, null, 'fetchProfile LID');

  // 6. profile do numero real
  await req('GET', `/chat/fetchProfile/${INSTANCE}/558496101515`, null, 'fetchProfile real number');
}

main().catch(console.error);
