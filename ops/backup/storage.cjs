const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function segment(value) {
  if (typeof value !== 'string' || !value || ['.', '..'].includes(value) || /[\\/\u0000-\u001f]/.test(value)) throw new Error('unsafe_storage_path');
  return value;
}
async function exportStorage(client, destination, limits = {}) {
  const maxFiles = limits.maxFiles || 10000, maxBytes = limits.maxBytes || 1073741824;
  const result = await client.storage.listBuckets();
  if (result.error || !Array.isArray(result.data)) throw new Error('storage_buckets_unavailable');
  const files = [], buckets = []; let bytes = 0;
  for (const bucket of result.data) {
    const id = segment(bucket.id); buckets.push({ id, public: bucket.public === true });
    const api = client.storage.from(id);
    async function list(prefix, depth = 0) {
      if (depth > 30) throw new Error('storage_tree_too_deep');
      const entries = [];
      for (let offset = 0; ; offset += 100) {
        const r = await api.list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (r.error || !Array.isArray(r.data)) throw new Error('storage_listing_unavailable');
        entries.push(...r.data); if (entries.length > maxFiles) throw new Error('storage_limit_exceeded');
        if (r.data.length < 100) break;
      }
      for (const item of entries) {
        const name = segment(item.name), key = prefix ? prefix + '/' + name : name;
        if (!item.id && !item.metadata) { await list(key, depth + 1); continue; }
        if (files.length >= maxFiles || Number(item.metadata?.size) > maxBytes - bytes) throw new Error('storage_limit_exceeded');
        const r = await api.download(key); if (r.error || !r.data) throw new Error('storage_download_failed');
        // Abort before writing an oversized response; avatars are bounded on upload too.
        if (r.data.size > maxBytes - bytes) throw new Error('storage_limit_exceeded');
        const data = Buffer.from(await r.data.arrayBuffer()); bytes += data.length;
        const relative = ['files', id, ...key.split('/')].join('/');
        const file = path.join(destination, relative); fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
        files.push({ path: relative, bucket: id, name: key, id: item.id, updatedAt: item.updated_at, serverETag: item.metadata?.eTag || null, size: data.length, sha256: createHash('sha256').update(data).digest('hex') });
      }
      // A mutable folder cannot silently become a successful stable backup.
      const again = [];
      for (let offset = 0; ; offset += 100) {
        const r = await api.list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (r.error || !Array.isArray(r.data)) throw new Error('storage_listing_unavailable');
        again.push(...r.data); if (again.length > maxFiles) throw new Error('storage_limit_exceeded');
        if (r.data.length < 100) break;
      }
      const signature = rows => JSON.stringify(rows.map(v => [v.name, v.id, v.updated_at, v.metadata?.size]));
      if (signature(entries) !== signature(again)) throw new Error('storage_changed_during_backup');
    }
    await list('');
  }
  return { buckets, files, bytes };
}
module.exports = { exportStorage, segment };
