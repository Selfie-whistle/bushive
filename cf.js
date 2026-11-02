const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('npx', ['-y', 'cloudflared', 'tunnel', '--url', 'http://localhost:3000'], { shell: true });

child.stderr.on('data', (data) => {
  const output = data.toString();
  const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match) {
    fs.writeFileSync('cf_url.txt', match[0]);
  }
});
