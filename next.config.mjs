import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  // Knowledge-base parsing/chunking runs only on the server; load these from
  // node_modules at runtime instead of bundling them.
  serverExternalPackages: ['unpdf', 'mammoth', 'turndown', 'jszip', 'markdown-it'],
  distDir: process.env.DIST_DIR || '.next',
  // Local dev: let the phone / emulator load the dev server by LAN IP
  // (e.g. DEV_ALLOWED_ORIGINS=192.168.1.20,10.0.2.2). Ignored in production.
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),

  typescript: {
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
    qualities: [75, 85, 100],
  },

  webpack(config, { dev }) {
if (dev) {
  config.module.rules.push({
    test: /\.(jsx|tsx)$/,
    exclude: [/node_modules/],
    use: [{
      loader: '@dhiwise/component-tagger/nextLoader',
    }],
  });
  const ignoredPaths = (process.env.WATCH_IGNORED_PATHS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  config.watchOptions = {
    ignored: ignoredPaths.length
      ? ignoredPaths.map((p) => `**/${p.replace(/^\/+|\/+$/g, '')}/**`)
      : undefined,
  };
}

    return config;
  }
};
export default nextConfig;