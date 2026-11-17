const fs = require('node:fs');
const path = require('node:path');

const trainingRoot = path.resolve(__dirname, '..');
const lessons = Array.from({length: 8}, (_, index) =>
  fs.readFileSync(path.join(trainingRoot, 'labs', `${String(index + 1).padStart(2, '0')}.md`), 'utf8').replace(/\r\n/g, '\n')
);
const setup = fs.readFileSync(path.join(trainingRoot, 'SETUP.md'), 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(path.join(trainingRoot, '../dist/course.js'), `window.COURSE = ${JSON.stringify({lessons, setup})};\n`);
console.log('Synchronized dashboard lessons and setup.');
