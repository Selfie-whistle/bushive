const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('ssh', ['-o', 'StrictHostKeyChecking=accept-new', '-R', '80:localhost:3000', 'nokey@localhost.run']);

child.stdout.on('data', (data) => {
  fs.appendFileSync('lh.log', data.toString());
});

child.stderr.on('data', (data) => {
  fs.appendFileSync('lh.log', data.toString());
});
