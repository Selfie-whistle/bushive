const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('ssh', ['-p', '443', '-R0:localhost:3000', '-o', 'StrictHostKeyChecking=no', 'a.pinggy.io']);

child.stdout.on('data', data => fs.appendFileSync('pinggy_out.txt', data.toString()));
child.stderr.on('data', data => fs.appendFileSync('pinggy_out.txt', data.toString()));
