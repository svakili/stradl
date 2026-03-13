import { startServer } from './app.js';

try {
  const { host, port } = await startServer();
  console.log(`Stradl running on http://${host}:${port}`);
} catch (error) {
  const message = error instanceof Error ? error.message : 'Failed to start Stradl.';
  console.error(message);
  process.exit(1);
}
