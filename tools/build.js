// Cross-platform wrapper: runs build.py with whichever Python is on the PATH (python3 on macOS/Linux, python on Windows).
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const args = [path.join(root, 'build.py'), ...process.argv.slice(2)];
for (const py of ['python3', 'python', 'py']) {
  const r = spawnSync(py, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' });
  if (r.error && r.error.code === 'ENOENT') continue;
  process.exit(r.status == null ? 1 : r.status);
}
console.error('Python 3 not found. Install it from python.org (tick "Add to PATH") and run npm run build again.');
process.exit(1);
