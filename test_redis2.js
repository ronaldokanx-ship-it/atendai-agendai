// Rodar de /evolution/ para ter acesso aos node_modules
const { createClient } = require('/evolution/node_modules/redis');
const LID = '167933355495634';

async function main() {
  const client = createClient({ socket: { host: '172.18.0.2', port: 6379 }, password: 'Kx9mP2nQ8rT5vW3yB6cD4hJ7sL1uN0zA' });
  await client.connect();
  console.log('Redis OK');

  // 1. Keys com o LID
  const lidKeys = await client.keys('*' + LID + '*');
  console.log('\nKeys com LID:', JSON.stringify(lidKeys));

  // 2. Amostras de todas as keys (primeiras 30)
  const allKeys = await client.keys('*');
  console.log('\nTotal keys Redis:', allKeys.length);
  
  // 3. Filtrar keys por tipo/padrão relevante
  const relevant = allKeys.filter(k =>
    k.includes('contact') || k.includes('Contact') ||
    k.includes('addrBook') || k.includes('addr-book') ||
    k.includes('jid') || k.includes('chat') ||
    k.includes('clinica')
  );
  console.log('\nKeys relevantes (' + relevant.length + '):', relevant.slice(0, 30));

  // 4. Verificar prefixos únicos (para entender estrutura)
  const prefixes = {};
  allKeys.forEach(k => {
    const p = k.split(':')[0];
    prefixes[p] = (prefixes[p] || 0) + 1;
  });
  console.log('\nPrefixos:', JSON.stringify(prefixes, null, 2));

  await client.quit();
}
main().catch(e => console.error('Erro:', e.message));
