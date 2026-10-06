import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { attachContext } from './auth/context.js';
import { accessLog, errorHandler, generalLimiter, securityHeaders } from './middleware/security.js';
import { api } from './routes/api.js';
import { resolvePath } from '../shared/routes.js';
import { renderIndex, robotsTxt, sitemapXml } from './spa.js';

export interface AppOptions {
  /** Folder holding the built front end. Defaults to ../dist. */
  distDir?: string;
  /** Overrides `PUBLIC_URL` (used by tests). */
  publicUrl?: string | null;
}

export function createApp(options: AppOptions = {}) {
  const publicUrl = options.publicUrl === undefined ? config.publicUrl : options.publicUrl;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(accessLog);
  app.use(attachContext);
  app.use('/api', generalLimiter, (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Large enough for the longest text /api/analyze accepts (UTF-8 can use up to 4 bytes per character).
  const jsonLimit = Math.max(300 * 1024, config.limits.maxInputChars * 2 * 4 + 4096);
  app.use('/api', express.json({ limit: jsonLimit }), api);

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600');
    res.send(robotsTxt(publicUrl));
  });
  app.get('/sitemap.xml', (_req, res) => {
    if (!publicUrl) {
      res.status(404).type('text/plain').send('There is no sitemap until PUBLIC_URL is set.\n');
      return;
    }
    res.type('application/xml').setHeader('Cache-Control', 'public, max-age=3600');
    res.send(sitemapXml(publicUrl));
  });

  const dist = options.distDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  const indexPath = path.join(dist, 'index.html');
  if (fs.existsSync(indexPath)) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
    app.use(express.static(dist, { index: false, maxAge: '1h' }));

    // The built page is read again only when the file changes (a rebuild), not on every request.
    let cached: { mtime: number; html: string } | null = null;
    const readIndex = () => {
      const mtime = fs.statSync(indexPath).mtimeMs;
      if (!cached || cached.mtime !== mtime) cached = { mtime, html: fs.readFileSync(indexPath, 'utf8') };
      return cached.html;
    };

    // Single-page-app fallback. Real pages get 200, old and trailing-slash addresses get a permanent redirect,
    // and anything else gets a real 404 (the app still draws its "Page not found" screen) that search engines skip.
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/') || path.extname(req.path)) return next();
      const target = resolvePath(req.path);
      if (target.kind === 'redirect') {
        const q = req.originalUrl.indexOf('?');
        res.redirect(301, target.to + (q === -1 ? '' : req.originalUrl.slice(q)));
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      if (target.kind === 'not-found') {
        res.status(404).setHeader('X-Robots-Tag', 'noindex');
        res.type('html').send(renderIndex(readIndex(), null, req.path));
        return;
      }
      res.type('html').send(renderIndex(readIndex(), publicUrl, req.path));
    });
  }

  app.use(errorHandler);
  return app;
}
