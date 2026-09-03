import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Read PORT from the project-root .env so the proxy follows the API.
  const env = loadEnv(mode, '..', '');
  const apiPort = env.PORT || '4100';

  return {
    plugins: [react()],
    server: {
      port: 5273,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
