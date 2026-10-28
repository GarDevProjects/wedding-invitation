import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL || undefined,
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
