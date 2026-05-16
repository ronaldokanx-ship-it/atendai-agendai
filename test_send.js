const http = require('http');

const API_KEY = 'HC8WnTpG+xQiBYqSzac3SfrTWEfBdNMIJHx45dTMJ8I=';

function sendRequest(path, body, label) {
  return new Promise((resolve) => {
    const d = JSON.stringify(body);
    const r = http.request({
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
        'Content-Length': Buffer.byteLength(d)
      }
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        console.log('[' + label + '] STATUS: ' + res.statusCode + ' BODY: ' + b.slice(0, 400));
        resolve();
      });
    });
    r.on('error', e => { console.log('[' + label + '] ERROR: ' + e.message); resolve(); });
    r.write(d);
    r.end();
  });
}

async function main() {
  // Verificar existencia dos numeros
  await sendRequest(
    '/chat/whatsappNumbers/clinica-1',
    { numbers: ['5584961015151', '167933355495634@lid', '558496101515'] },
    'LOOKUP'
  );
  
  // Teste 1: enviar texto para o JID @lid do paciente
  await sendRequest(
    '/message/sendText/clinica-1',
    { number: '167933355495634@lid', text: 'Teste de envio via @lid - ClinicAI patch check' },
    'SEND_LID'
  );
  
  // Teste 2: enviar texto para o numero real do paciente
  await sendRequest(
    '/message/sendText/clinica-1',
    { number: '5584961015151', text: 'Teste de envio via numero real - ClinicAI' },
    'SEND_REAL'
  );
}

main();
