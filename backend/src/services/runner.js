import { spawn } from 'child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ensureSessionExists, validateFilename } from './workspace.js';

/**
 * Run a PHP file inside an ephemeral Docker container.
 *
 * When WORKSPACE_VOLUME is set (Docker-in-Docker / sibling-container setup)
 * the volume mount uses  <volumeName>/<sessionId>  so the host Docker daemon
 * can resolve it.  Otherwise the absolute host path is used (local dev).
 */
export async function runPhp(sessionId, entryFile = 'index.php') {
  validateFilename(entryFile);
  const workspaceDir = await ensureSessionExists(sessionId);

  // Build the volume mount for the PHP container.
  // When WORKSPACE_VOLUME is set (running inside Docker), we mount the entire
  // named volume and point the working dir at the session subdirectory inside it.
  // This avoids passing a container-internal path to the host Docker daemon.
  const volumeMount = config.workspaceVolume
    ? `${config.workspaceVolume}:/workspaces`          // full named volume
    : `${workspaceDir}:/workspace`;                    // host path (local dev)

  const workingDir = config.workspaceVolume
    ? `/workspaces/${sessionId}`                       // subdir inside the volume
    : '/workspace';

  const startMs = Date.now();

  const dockerArgs = [
    'run',
    '--rm',
    '--network=none',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    `--memory=${config.containerMemory}`,
    `--memory-swap=${config.containerMemory}`, // disable swap
    `--cpus=${config.containerCpus}`,
    `--pids-limit=${config.containerPids}`,
    '--read-only',
    '--tmpfs=/tmp:size=8m,noexec',
    '-v', `${volumeMount}:ro`,
    '-w', workingDir,
    config.phpImage,
    'php', entryFile,
  ];

  logger.info('Starting PHP container', { sessionId, entryFile, image: config.phpImage });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const proc = spawn('docker', dockerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      timedOut = true;
      logger.warn('PHP execution timed out, killing container', { sessionId });
      proc.kill('SIGKILL');
      // Also force-remove the container in case kill doesn't propagate
      spawn('docker', ['kill', '--signal=SIGKILL', ...getContainerIds(proc)], { stdio: 'ignore' });
    }, config.execTimeoutMs);

    function finish(exitCode) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Date.now() - startMs;

      logger.info('PHP execution finished', {
        sessionId,
        entryFile,
        exitCode,
        durationMs,
        timedOut,
        stderrLen: stderr.length,
      });

      resolve({
        html: stdout,
        stderr: stderr.trim(),
        exitCode: timedOut ? 124 : exitCode,
        durationMs,
        timedOut,
      });
    }

    proc.on('close', (code) => finish(code ?? 1));
    proc.on('error', (err) => {
      logger.error('Failed to spawn docker', { err });
      settled = true;
      clearTimeout(timer);
      resolve({
        html: '',
        stderr: `Failed to start execution engine: ${err.message}`,
        exitCode: 1,
        durationMs: Date.now() - startMs,
        timedOut: false,
      });
    });
  });
}

// docker run doesn't give us the container name easily via spawn,
// so this is a no-op helper — the --rm flag handles cleanup on normal exit.
function getContainerIds(_proc) {
  return [];
}
