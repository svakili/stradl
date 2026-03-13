import express from 'express';
import type { Express } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { taskRoutes } from './routes/tasks.js';
import { blockerRoutes } from './routes/blockers.js';
import { settingsRoutes } from './routes/settings.js';
import { updateRoutes } from './routes/update.js';
import { dataRoutes } from './routes/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '127.0.0.1';

export interface CreateAppOptions {
  distPath?: string;
}

export interface StartServerOptions extends CreateAppOptions {
  host?: string;
  port?: number;
}

function resolveProjectRoot(): string {
  return __dirname.endsWith('server/dist') || __dirname.endsWith('server\\dist')
    ? path.join(__dirname, '..', '..')
    : path.join(__dirname, '..');
}

function resolveDistPath(distPath?: string): string {
  if (distPath) return distPath;
  return path.join(resolveProjectRoot(), 'dist');
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const distPath = resolveDistPath(options.distPath);

  app.use(express.json({ limit: '10mb' }));

  app.use('/api', taskRoutes);
  app.use('/api', blockerRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', dataRoutes);
  app.use('/api', updateRoutes);

  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  return app;
}

export async function startServer(options: StartServerOptions = {}) {
  const app = createApp({ distPath: options.distPath });
  const host = options.host ?? process.env.HOST ?? DEFAULT_HOST;
  const requestedPort = options.port ?? Number(process.env.PORT ?? DEFAULT_PORT);

  const server = await new Promise<import('http').Server>((resolve, reject) => {
    const nextServer = app.listen(requestedPort, host, () => resolve(nextServer));
    nextServer.on('error', reject);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;

  return { app, server, host, port };
}
