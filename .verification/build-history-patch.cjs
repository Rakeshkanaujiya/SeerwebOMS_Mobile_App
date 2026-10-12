const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.resolve(root, '../live_backend/app/Controllers/ProductController.php'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('    /**\n     * Return product ordering totals');
const end = source.indexOf('    // ', start + 10);
if (start < 0 || end < 0) throw new Error('History method boundaries not found');
const before = source.slice(0, start) + source.slice(end);
const hash = crypto.createHash('sha256').update(before).digest('hex');
if (hash !== 'c98baf841757c449ad914ed05374b1d9e2ecf015d26db514c79e7b12ea15208c') throw new Error('Live baseline differs');
const added = source.slice(start, end).split('\n').slice(0, -1);
const context = source.slice(end).split('\n')[0];
const line = source.slice(0, start).split('\n').length;
const patch = [
  '--- app/Controllers/ProductController.php',
  '+++ app/Controllers/ProductController.php',
  `@@ -${line},1 +${line},${added.length + 1} @@`,
  ...added.map(value => '+' + value),
  ' ' + context,
  '--- app/Config/Routes.php',
  '+++ app/Config/Routes.php',
  '@@ -159,1 +159,3 @@',
  "     $routes->get('', 'ProductController::index');",
  '+',
  "+    $routes->get('sales-history', 'ProductController::salesHistory');",
  '',
].join('\n');
fs.writeFileSync(path.join(root, 'deployment/party-sales-history/production.patch'), patch);
console.log(Buffer.from(patch).toString('base64'));
