import { scrapeSearchPage } from '../search/scraper';
import { scrapeModelPage } from '../model/scraper';
import { UpstreamError, ParseError } from '../errors';
import type { ModelPage } from '../search/types';
import type { CheckResult, HealthStatus } from './types';

interface Env {
  OLLAMA_BASE: string;
  OLLAMA_USER_AGENT: string;
  OLLAMA_ACCEPT: string;
  OLLAMA_ACCEPT_LANGUAGE: string;
}

type FailureKind = 'structure_change' | 'upstream_down' | 'network_error';

function classify(err: unknown): FailureKind {
  if (err instanceof ParseError) return 'structure_change';
  if (err instanceof UpstreamError) return 'upstream_down';
  return 'network_error';
}

function worstKind(a: FailureKind | null, b: FailureKind | null): FailureKind | null {
  if (a === 'structure_change' || b === 'structure_change') return 'structure_change';
  if (a === 'upstream_down' || b === 'upstream_down') return 'upstream_down';
  if (a === 'network_error' || b === 'network_error') return 'network_error';
  return null;
}

/**
 * Well-known probe target with a reliably large number of tags.
 *
 * 태그 수가 안정적으로 많은 잘 알려진 프로브 대상.
 */
export function createProbeModel(env: Env): ModelPage {
  return {
    http_url: `${env.OLLAMA_BASE}/library/qwen3`,
    model_id: 'library/qwen3',
  };
}

/**
 * Keyword used for search scraper probe.
 *
 * 검색 스크래퍼 프로브에 사용되는 키워드.
 */
export const PROBE_KEYWORD = 'qwen';

/**
 * Runs live probes against both scrapers with stable inputs and returns a
 * structured result.
 *
 * 안정적인 입력으로 두 스크래퍼에 대해 라이브 프로브를 실행하고 구조화된 결과를 반환한다.
 *
 * Neither probe throws — errors are captured in the returned
 * `CheckResult.error` field so the `/health` handler can always respond.
 *
 * 어느 프로브도 예외를 던지지 않는다 — 에러는 반환된 `CheckResult.error` 필드에
 * 캡처되므로 `/health` 핸들러는 항상 응답할 수 있다.
 *
 * @returns A {@link HealthStatus} whose `ok` is `true` only when both the
 *   search and model scrapers succeed.
 * @returns 검색 및 모델 스크래퍼 모두 성공할 때만 `ok`가 `true`인 {@link HealthStatus}.
 */
export async function runHealthCheck(env: Env): Promise<HealthStatus> {
  const probeModel = createProbeModel(env);
  const timestamp = new Date().toISOString();
  let search: CheckResult = { ok: false, kind: null };
  let model: CheckResult = { ok: false, kind: null };

  try {
    const pages = await scrapeSearchPage(1, PROBE_KEYWORD, env);
    search = { ok: pages.length > 0, count: pages.length, kind: null };
  } catch (err) {
    search = { ok: false, error: String(err), kind: classify(err) };
  }

  try {
    const { tags } = await scrapeModelPage(probeModel, env);
    model = { ok: tags.length > 0, count: tags.length, kind: null };
  } catch (err) {
    model = { ok: false, error: String(err), kind: classify(err) };
  }

  const failure_kind = worstKind(search.kind ?? null, model.kind ?? null);
  return { ok: search.ok && model.ok, timestamp, checks: { search, model }, failure_kind };
}
