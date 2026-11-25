import { build } from 'esbuild'

// Keep the other task's in-progress release files untouched.
await build({
  entryPoints: ['verification/approval-candidate-entry.js'],
  outfile: '.local/approval-candidate.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['@hermes/plugin-sdk', 'react'],
  define: { HCV_LOCAL_VERSION: JSON.stringify('approval-candidate') },
})
