const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('ssh', ['-vvv', '-o', 'StrictHostKeyChecking=accept-new', '-R', '80:localhost:3000', 'nokey@localhost.run']);
child.stderr.on('data', data => fs.appendFileSync('ssh_debug.log', data.toString()));
