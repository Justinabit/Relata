/**
 * `npm start` entry point. Production mode is set here rather than in package.json, because the
 * `NODE_ENV=production command` form only works in Unix shells, not in Windows Command Prompt or PowerShell.
 */
process.env.NODE_ENV ??= 'production';
await import('./index.js');

export {};
