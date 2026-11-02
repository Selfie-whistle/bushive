const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('ssh', ['-R', '80:localhost:3000', '-o', 'StrictHostKeyChecking=accept-new', 'serveo.net']);

child.stdout.on('data', data => fs.appendFileSync('serveo.txt', data.toString()));
child.stderr.on('data', data => fs.appendFileSync('serveo.txt', data.toString()));
