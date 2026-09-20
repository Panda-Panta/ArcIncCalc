import { defineConfig, configDefaults } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      '.worktrees/**',
      '.antigravity-bridge/**',
      'dist/**',
      'artifacts/**',
      'scratch/**',
    ],
  },
})
