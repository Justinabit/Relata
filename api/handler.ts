import path from 'node:path';
import { createApp } from '../server/app.js';

// Vercel owns the HTTP listener. Keep the standalone server in server/index.ts.
const app = createApp({ distDir: path.join(process.cwd(), 'dist') });
// Vercel's gateway supplies the visitor IP in X-Forwarded-For.
app.set('trust proxy', 1);

export default app;
