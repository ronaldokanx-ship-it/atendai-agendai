const {fetchLatestBaileysVersion} = require('/evolution/node_modules/baileys');
fetchLatestBaileysVersion().then(function(v) {
  console.log(JSON.stringify(v));
}).catch(function(e) {
  console.log('FAIL:', e.message);
  // Fallback: check the version.json
  try {
    const vj = require('/evolution/node_modules/baileys/lib/Defaults/baileys-version.json');
    console.log('STATIC_VERSION:', JSON.stringify(vj));
  } catch(e2) {
    console.log('NO_VERSION_FILE');
  }
});
