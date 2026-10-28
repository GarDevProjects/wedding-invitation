import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = resolve('scripts/secure-build.mjs');
describe('deployed content security policy', () => {
  for (const directory of ['dist', 'dist/client']) {
    it(`writes hydration hashes beside the served HTML in ${directory}`, async () => {
      const temporaryRoot = resolve(tmpdir());
      const fixture = await mkdtemp(join(temporaryRoot, 'wedding-security-'));
      try {
        await mkdir(join(fixture, directory, 'admin'), { recursive: true });
        await mkdir(join(fixture, 'public'));
        const bootstrap = 'customElements.define("test-island", class extends HTMLElement {});';
        const expectedHash = createHash('sha256').update(bootstrap).digest('base64');
        await writeFile(join(fixture, directory, 'index.html'), '<script src="/app.js"></script>');
        await writeFile(join(fixture, directory, 'admin/index.html'), `<script type="module">${bootstrap}</script>`);
        await writeFile(join(fixture, 'public/_headers'), "/*\n  Content-Security-Policy: script-src 'self'; object-src 'none'\n");
        execFileSync(process.execPath, [script], { cwd: fixture });
        const policy = await readFile(join(fixture, directory, '_headers'), 'utf8');
        expect(policy).toContain(`'sha256-${expectedHash}'`);
        expect(policy).not.toContain("'unsafe-inline'");
        expect(policy).toContain("object-src 'none'");
        expect(policy.match(/sha256-/g)).toHaveLength(1);
      } finally {
        // Verify the generated target stays in the test's named temporary directory before deletion.
        if (fixture.startsWith(temporaryRoot + sep) && basename(fixture).startsWith('wedding-security-')) {
          await rm(fixture, { recursive: true, force: true });
        }
      }
    });
  }
});
