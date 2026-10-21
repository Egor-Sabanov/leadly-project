const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const destination = process.argv[2] && path.resolve(process.argv[2]);
const repository = path.resolve(__dirname, '../..');
if (!destination || destination === repository || destination.startsWith(repository + path.sep) || fs.existsSync(destination)) {
  console.error('Choose a new private directory outside the repository'); process.exitCode = 1;
} else {
  process.umask(0o077); fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const home = path.join(destination, 'gpg'); fs.mkdirSync(home, { mode: 0o700 });
  const pass = path.join(destination, 'passphrase.txt'); fs.writeFileSync(pass, randomBytes(48).toString('base64url'), { mode: 0o600 });
  function run(args) { const r = spawnSync('gpg', ['--batch', '--homedir', home, ...args], { encoding: 'utf8' }); if (r.status) throw new Error('key_generation_failed'); return r.stdout; }
  try {
    const secret = ['--pinentry-mode', 'loopback', '--passphrase-file', pass];
    run([...secret, '--quick-generate-key', 'LEADLY Backup', 'rsa3072', 'encrypt', '2y']);
    fs.writeFileSync(path.join(destination, 'public.asc'), run(['--armor', '--export']), { mode: 0o600 });
    fs.writeFileSync(path.join(destination, 'private.asc'), run([...secret, '--armor', '--export-secret-keys']), { mode: 0o600 });
    const fingerprint = run(['--with-colons', '--list-keys']).split('\n').find(line => line.startsWith('fpr:')).split(':')[9];
    console.log(JSON.stringify({ created: true, privateMaterialPrinted: false, publicKeyFingerprint: fingerprint }));
  } catch { console.error('Backup key generation failed; private material was not printed'); process.exitCode = 1; }
}
