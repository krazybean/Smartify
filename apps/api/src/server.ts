import { createApp } from './app';

const PORT = 3001;

const app = await createApp();

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log('[api] restarted');
  console.log(`API running on http://localhost:${PORT}`);
});
