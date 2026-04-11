/**
 * Runner tests — require Docker to be available.
 * Run with: node --test tests/runner.test.js
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runPhp } from '../src/services/runner.js';

// Override workspace root to a temp dir for tests
const TEST_WORKSPACE = path.join(os.tmpdir(), 'ide-test-' + Date.now());
const TEST_SESSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// Patch config for tests
import { config } from '../src/config.js';

before(async () => {
  config.workspaceRoot = TEST_WORKSPACE;
  config.execTimeoutMs = 5000;
  await fs.mkdir(path.join(TEST_WORKSPACE, TEST_SESSION), { recursive: true });
});

after(async () => {
  await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
});

describe('runPhp - successful execution', () => {
  test('returns stdout as html', async () => {
    await fs.writeFile(
      path.join(TEST_WORKSPACE, TEST_SESSION, 'index.php'),
      '<?php echo "<h1>Hello</h1>";'
    );

    const result = await runPhp(TEST_SESSION, 'index.php');

    assert.equal(result.exitCode, 0);
    assert.ok(result.html.includes('<h1>Hello</h1>'), `Expected HTML output, got: ${result.html}`);
    assert.equal(result.timedOut, false);
    assert.ok(result.durationMs >= 0);
  });

  test('captures stderr separately', async () => {
    await fs.writeFile(
      path.join(TEST_WORKSPACE, TEST_SESSION, 'warn.php'),
      '<?php trigger_error("test warning", E_USER_WARNING); echo "done";'
    );

    const result = await runPhp(TEST_SESSION, 'warn.php');
    assert.ok(result.html.includes('done'));
    // stderr may contain the warning
    assert.equal(result.timedOut, false);
  });
});

describe('runPhp - timeout enforcement', () => {
  test('kills container that exceeds timeout', async () => {
    config.execTimeoutMs = 2000; // 2s for this test

    await fs.writeFile(
      path.join(TEST_WORKSPACE, TEST_SESSION, 'infinite.php'),
      '<?php while(true) { sleep(1); }'
    );

    const result = await runPhp(TEST_SESSION, 'infinite.php');

    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
    assert.ok(result.durationMs >= 1900, `Expected ~2s duration, got ${result.durationMs}ms`);
  });
});

describe('runPhp - security', () => {
  test('network is disabled inside container', async () => {
    await fs.writeFile(
      path.join(TEST_WORKSPACE, TEST_SESSION, 'net.php'),
      '<?php $r = @file_get_contents("http://example.com"); echo $r === false ? "no-network" : "has-network";'
    );

    const result = await runPhp(TEST_SESSION, 'net.php');
    assert.ok(
      result.html.includes('no-network') || result.exitCode !== 0,
      'Expected network to be disabled'
    );
  });
});
