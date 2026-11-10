import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
export const channel =
  process.platform === 'win32' &&
  existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'chrome'
    : undefined
export default defineConfig({
  testDir: './browser',
  testMatch: '**/*.pw.ts',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4286',
    viewport: { width: 1440, height: 900 },
    ...(channel ? { channel } : {}),
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4286 --strictPort',
    url: 'http://127.0.0.1:4286',
    reuseExistingServer: !process.env.CI,
  },
})
