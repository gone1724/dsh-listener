import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import assert from 'node:assert/strict'
const tar = gunzipSync(readFileSync('output/dsh-speeker-0.3.4.tgz'))
const files = new Map()
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512)
  const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '')
  if (!name) break
  const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0
  files.set(name, tar.subarray(offset + 512, offset + 512 + size))
  offset += 512 + Math.ceil(size / 512) * 512
}
for (const name of ['lib/index.js', 'lib/client.js', 'lib/pcm-worklet.js', 'cordis.patch.yml', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'docs/VALIDATION.md', 'docs/UPDATES.md', 'package.json']) {
  assert.ok(files.get(`package/${name}`)?.length, `Missing package file: ${name}`)
}
assert.match(files.get('package/lib/client.js').toString(), /window\.__ModuleLoader__\.load/)
assert.match(files.get('package/lib/pcm-worklet.js').toString(), /registerProcessor/)
assert.ok(![...files.keys()].some(name => /(?:\.env|credentials|harness-home|node_modules|mock-cloud)/.test(name)), 'Unexpected private or test file in package')
console.log(`Package verified: ${files.size} files, client module factory and PCM worklet included.`)
