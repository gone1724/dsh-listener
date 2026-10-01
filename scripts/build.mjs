import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
await mkdir('lib', { recursive: true })
await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
// Harness loads client bundles through its CommonJS module factory, not browser ESM imports.
// Adapted from forrestahha/dsh-voice-input's MIT build configuration.
await build({ entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js', bundle: true, platform: 'browser', format: 'cjs', packages: 'external', target: 'es2022',
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-speeker", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
await copyFile('src/client/pcm-worklet.js', 'lib/pcm-worklet.js')
