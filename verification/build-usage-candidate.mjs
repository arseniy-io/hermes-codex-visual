import { build } from 'esbuild'

// A separate candidate avoids changing another task's in-progress release.
await build({
  entryPoints: ['verification/usage-candidate-entry.js'],
  outfile: '.local/usage-candidate.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['@hermes/plugin-sdk', 'react'],
  define: { HCV_LOCAL_VERSION: JSON.stringify('usage-candidate') },
})
