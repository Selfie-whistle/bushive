const localtunnel = require('localtunnel');
const fs = require('fs');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3000, subdomain: 'bharatbus-admin-app' });
    fs.writeFileSync('lt2.txt', tunnel.url);
    console.log("Tunnel is active at: " + tunnel.url);
  } catch(e) {
    fs.writeFileSync('lt2.txt', 'error');
    console.error(e);
  }
})();
