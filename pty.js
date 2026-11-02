const pty = require('node-pty');
const fs = require('fs');

const ptyProcess = pty.spawn('powershell.exe', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env
});

ptyProcess.on('data', function(data) {
  fs.appendFileSync('pty_out.txt', data);
});

ptyProcess.write('ssh -p 443 -R0:localhost:3000 -o StrictHostKeyChecking=accept-new a.pinggy.io\r');
