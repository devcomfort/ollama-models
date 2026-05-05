import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://ollama-models.pages.dev',
  integrations: [
    starlight({
      title: 'ollama-models',
      defaultLocale: 'en',
      locales: {
        en: { label: 'English' },
        ko: { label: '한국어' },
      },
      sidebar: [
        {
          label: 'Getting Started',
          translations: { ko: '시작하기' },
          items: [
            { label: 'Introduction', translations: { ko: '소개' }, link: '/en/' },
          ],
        },
        {
          label: 'API Reference',
          translations: { ko: 'API 레퍼런스' },
          items: [
            { label: 'Endpoints', translations: { ko: '엔드포인트' }, link: '/en/api-reference/' },
          ],
        },
        {
          label: 'Clients',
          translations: { ko: '클라이언트' },
          items: [
            { label: 'TypeScript Client', translations: { ko: 'TypeScript 클라이언트' }, link: '/en/ts-client/' },
            { label: 'Python Client', translations: { ko: 'Python 클라이언트' }, link: '/en/py-client/' },
          ],
        },
        {
          label: 'Deep Dive',
          translations: { ko: '심화' },
          items: [
            { label: 'Architecture', translations: { ko: '아키텍처' }, link: '/en/architecture/' },
            { label: 'Deployment', translations: { ko: '배포' }, link: '/en/deployment/' },
            { label: 'Auto-Heal', translations: { ko: 'Auto-Heal' }, link: '/en/auto-heal/' },
          ],
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/devcomfort/ollama-models' },
      ],
    }),
  ],
});