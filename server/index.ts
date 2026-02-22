import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { taskRoutes } from './routes/tasks.js';
import { blockerRoutes } from './routes/blockers.js';
import { settingsRoutes } from './routes/settings.js';
import { updateRoutes } from './routes/update.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(express.json());

// API routes
app.use('/api', taskRoutes);
app.use('/api', blockerRoutes);
app.use('/api', settingsRoutes);
app.use('/api', updateRoutes);

// Serve static files in production (Vite build output is at project root /dist)
// When running compiled JS from server/dist/, go up two levels to project root
const projectRoot = __dirname.endsWith('server/dist') || __dirname.endsWith('server\\dist')
  ? path.join(__dirname, '..', '..')
  : path.join(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');

app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Stradl running on http://localhost:${PORT}`);
});
