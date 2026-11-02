const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('npx', ['-y', 'untun@latest', 'tunnel', 'http://localhost:3000'], { shell: true });

child.stdout.on('data', (data) => {
  const output = data.toString();
  fs.appendFileSync('untun.log', output);
});

child.stderr.on('data', (data) => {
  const output = data.toString();
  fs.appendFileSync('untun.log', output);
});
