const redis = require('redis');
const LID_DIGITS = '167933355495634';

async function main() {
  const client = redis.createClient({ socket: { host: 'evolution-redis', port: 6380 } });
  await client.connect();
  console.log('Redis conectado');

  // Buscar todas as keys que contem o LID
  const allKeys = await client.keys('*' + LID_DIGITS + '*');
  console.log('\nKeys contendo o LID:', allKeys.length > 0 ? allKeys : 'nenhuma');

  // Buscar keys do tipo authState (onde Baileys armazena contatos)
  const authKeys = await client.keys('*clinica-1*');
  console.log('\nKeys de clinica-1:', authKeys.length);
  // Amostras
  if (authKeys.length > 0) {
    console.log('Primeiras 10 keys:', authKeys.slice(0, 10));
    
    // Procurar keys que possam ter mapeamento de contatos
    const contactKeys = authKeys.filter(k => 
      k.includes('contact') || k.includes('Contact') || 
      k.includes('addrBook') || k.includes('addr') ||
      k.includes('jid') || k.includes('chat')
    );
    console.log('\nKeys de contatos/chats:', contactKeys.slice(0, 20));
  }

  // Tentar buscar por padrao addrBook
  const addrKeys = await client.keys('*addrBook*');
  console.log('\nKeys addrBook:', addrKeys.length > 0 ? addrKeys.slice(0, 10) : 'nenhuma');

  // Tentar buscar por padrão de session
  const sessionKeys = await client.keys('*session*');
  console.log('\nKeys session:', sessionKeys.length > 0 ? sessionKeys.slice(0, 10) : 'nenhuma');

  await client.quit();
}

main().catch(e => console.error('Erro:', e.message));
