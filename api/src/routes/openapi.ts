export const openapiConfig = {
  openapi: '3.0.0',
  info: {
    title: 'Ollama Models API',
    version: '0.2.0',
    description: 'JSON HTTP API for searching Ollama models and listing their tags, backed by live scraping of ollama.com.',
  },
  servers: [
    { url: 'https://ollama-models-api.devcomfort.workers.dev', description: 'Production (Cloudflare Workers)' },
  ],
};
