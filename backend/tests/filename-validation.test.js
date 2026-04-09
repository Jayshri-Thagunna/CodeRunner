import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateFilename } from '../src/services/workspace.js';
import { AppError } from '../src/middleware/errorHandler.js';

describe('validateFilename', () => {
  test('accepts valid filenames', () => {
    const valid = ['index.php', 'my-file.php', 'helper_v2.js', 'style.css', 'README.md'];
    for (const name of valid) {
      assert.doesNotThrow(() => validateFilename(name), `Expected "${name}" to be valid`);
    }
  });

  test('rejects path traversal with ../', () => {
    assert.throws(() => validateFilename('../etc/passwd'), AppError);
  });

  test('rejects path traversal with ..\\', () => {
    assert.throws(() => validateFilename('..\\windows\\system32'), AppError);
  });

  test('rejects filenames with forward slash', () => {
    assert.throws(() => validateFilename('subdir/file.php'), AppError);
  });

  test('rejects filenames with null bytes', () => {
    assert.throws(() => validateFilename('file\x00.php'), AppError);
  });

  test('rejects empty string', () => {
    assert.throws(() => validateFilename(''), AppError);
  });

  test('rejects null', () => {
    assert.throws(() => validateFilename(null), AppError);
  });

  test('rejects filenames over 128 chars', () => {
    assert.throws(() => validateFilename('a'.repeat(129) + '.php'), AppError);
  });

  test('rejects filenames without extension', () => {
    assert.throws(() => validateFilename('noextension'), AppError);
  });

  test('rejects filenames with shell metacharacters', () => {
    const dangerous = ['file;rm.php', 'file$(cmd).php', 'file`cmd`.php', 'file|pipe.php'];
    for (const name of dangerous) {
      assert.throws(() => validateFilename(name), AppError, `Expected "${name}" to be rejected`);
    }
  });
});
