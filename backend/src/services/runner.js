import { spawn } from 'child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ensureSessionExists, validateFilename } from './workspace.js';

export async function runPhp(sessionId, entryFile = 'index.php') {
  validateFilename(entryFile);
  const workspaceDir = await ensureSessionExists(sessionId);

  const volumeMount = config.workspaceVolume
    ? `${config.workspaceVolume}:/workspaces`          
    : `${workspaceDir}:/workspace`;                    

  const workingDir = config.workspaceVolume
    ? `/workspaces/${sessionId}`                       
    : '/workspace';

  const startMs = Date.now();

  const dockerArgs = [
    'run',
    '--rm',
    '--network=none',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    `--memory=${config.containerMemory}`,
    `--memory-swap=${config.containerMemory}`,
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

function getContainerIds(_proc) {
  return [];
}
