const http = require('http');

function req(body, label) {
  return new Promise((resolve) => {
    const d = JSON.stringify(body);
    const r = http.request({
      hostname: 'localhost',
      port: 8080,
      path: '/chat/whatsappNumbers/clinica-1',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': '429683C4C977415CAAFCCE10F7D57E11',
        'Content-Length': Buffer.byteLength(d)
      }
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        console.log(label + ' | STATUS: ' + res.statusCode + ' | ' + b.slice(0, 300));
        resolve();
      });
    });
    r.on('error', e => { console.log(label + ' ERROR: ' + e.message); resolve(); });
    r.write(d);
    r.end();
  });
}

async function main() {
  await req({ numbers: ['5584961015151'] }, 'NUMERO_REAL');
  await req({ numbers: ['167933355495634@lid'] }, 'LID');
  await req({ numbers: ['558496101515'] }, 'NUMERO_SEM_9');
}
main();
