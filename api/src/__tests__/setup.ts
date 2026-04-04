/**
 * API 패키지 테스트 환경 설정 (Vitest)
 *
 * 목적
 * ────
 * Cloudflare Workers 런타임은 `caches.default`(Cache API)를 전역으로 제공하지만,
 * Vitest는 순수 Node.js 환경에서 실행되어 해당 전역이 없다.
 * 이 파일이 없으면 `app`을 임포트하는 테스트가 모듈 로드 단계에서 예외를 던진다.
 *
 * `api/vitest.config.ts`의 `setupFiles`에 등록되어 모든 테스트 모듈이 로드되기
 * 전에 한 번 실행된다.
 *
 * 설계
 * ────
 * `withCache()`가 필요로 하는 최소 인터페이스(match / put)만 no-op으로 구현한
 * `Cache` 객체를 `globalThis.caches.default`에 설치한다.
 * 캐시의 기능적 정합성은 여기서 검증하지 않으며, 통합 테스트 레이어에서 검증한다.
 */

// Workers 런타임이 제공하는 `caches.default`를 Node.js 환경에서 no-op으로 대체한다.
// 테스트에서는 인터페이스 자체가 호출 가능하기만 하면 충분하며, 동작 정확성은 요구하지 않는다.
const noopCache: Cache = {
  match: async () => undefined,
  put: async () => undefined,
  delete: async () => false,
  keys: async () => [],
  add: async () => undefined,
  addAll: async () => undefined,
} as unknown as Cache;

Object.defineProperty(globalThis, 'caches', {
  value: { default: noopCache },
  writable: true,
});
