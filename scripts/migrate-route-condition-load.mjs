import fs from 'node:fs';

const file = 'index.html';
let source = fs.readFileSync(file, 'utf8');
const marker = '<script src="js/route-condition-view-model.js?v=43"></script>';
const target = '<script src="js/route-conditions.js?v=42"></script>';

if (!source.includes(marker)) {
  if (!source.includes(target)) throw new Error('route-conditions script tag not found');
  source = source.replace(target, marker + '\n' + target);
  fs.writeFileSync(file, source);
  console.log('route-condition view model load order applied');
} else {
  console.log('route-condition view model already loaded globally');
}
