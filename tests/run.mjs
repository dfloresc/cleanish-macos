import { build } from 'esbuild'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'cleanish-tests-')))
try {
  await build({
    entryPoints: [path.join(root, 'tests/services.test.ts')], outfile: path.join(temporary, 'tests.cjs'),
    bundle: true, platform: 'node', target: 'node22', format: 'cjs',
    plugins: [{ name: 'isolated-filesystem', setup(builder) {
      builder.onResolve({ filter: /^(electron|node:os|fs\/promises)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
        if (args.path === 'node:os') return { contents: `import os from 'os'; export default { ...os, homedir: () => process.env.CLEANISH_TEST_HOME };` }
        if (args.path === 'electron') return { contents: `
          import path from 'node:path'; import { mkdir, rename } from 'node:fs/promises';
          export const app = { getPath: () => path.join(process.env.CLEANISH_TEST_HOME, 'settings'), getFileIcon: async () => ({ isEmpty: () => true }) };
          export const shell = { trashItem: async (p) => {
            if (!p.startsWith(process.env.CLEANISH_TEST_HOME + '/')) throw new Error('outside fixture');
            await mkdir(path.join(process.env.CLEANISH_TEST_HOME, '.Trash'), { recursive: true });
            await rename(p, path.join(process.env.CLEANISH_TEST_HOME, '.Trash', path.basename(p)));
          } };
        ` }
        return { contents: `
          export * from 'node:fs/promises'; import * as fs from 'node:fs/promises';
          export async function readdir(p, opts) {
            if (p === '/Applications' || p === '/System/Applications') return [];
            (globalThis.__reads ??= []).push(String(p));
            if (String(p).endsWith('/Unreadable')) throw Object.assign(new Error('no access'), { code: 'EACCES' });
            return fs.readdir(p, opts);
          }
        ` }
      })
    } }]
  })
  const child = spawn(process.execPath, ['--test', path.join(temporary, 'tests.cjs')], {
    stdio: 'inherit', env: { ...process.env, CLEANISH_TEST_HOME: temporary }
  })
  process.exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)))
} finally { await rm(temporary, { recursive: true, force: true }) }
