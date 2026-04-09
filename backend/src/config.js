export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  corsOrigin: '*',

  // Workspace storage
  workspaceRoot: process.env.WORKSPACE_ROOT || '/tmp/ide-workspaces',
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || String(512 * 1024), 10), // 512 KB
  maxWorkspaceSizeBytes: parseInt(process.env.MAX_WORKSPACE_SIZE_BYTES || String(5 * 1024 * 1024), 10), // 5 MB
  maxFilesPerSession: parseInt(process.env.MAX_FILES_PER_SESSION || '50', 10),

  // When running inside Docker, set this to the named volume that holds
  // workspaces so sibling PHP containers can mount it by volume name.
  // Leave unset for local (non-Docker) development.
  workspaceVolume: process.env.WORKSPACE_VOLUME || '',

  // Docker execution
  phpImage: process.env.PHP_IMAGE || 'php:8.2-cli-alpine',
  execTimeoutMs: parseInt(process.env.EXEC_TIMEOUT_MS || '5000', 10),
  containerMemory: process.env.CONTAINER_MEMORY || '64m',
  containerCpus: process.env.CONTAINER_CPUS || '0.5',
  containerPids: parseInt(process.env.CONTAINER_PIDS || '32', 10),

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(60 * 1000), 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  runRateLimitMax: parseInt(process.env.RUN_RATE_LIMIT_MAX || '10', 10),
};
