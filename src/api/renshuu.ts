/**
 * A small typed client for the Renshuu API.
 *
 * Where this is (and isn't) used:
 *   - `scripts/snapshot.ts` uses it in GitHub Actions to collect the daily data.
 *   - You can use it locally to poke at the API by hand.
 *   - The deployed frontend does NOT use it. The dashboard reads the committed
 *     `data/history.json` instead, so no API key ever reaches the browser.
 *
 * That last point matters for two reasons. An API key shipped in frontend code
 * is public no matter how it's stored, and the API doesn't send CORS headers
 * that would let a browser call it from another origin anyway.
 */

import type {
  ApiUsage,
  RenshuuProfile,
  RenshuuSchedule,
  RenshuuScheduleList,
  StudiedCounts,
  UpcomingReviews,
} from '../types/renshuu.ts'

/** Base URL, straight from the `servers` block of the OpenAPI spec. */
const DEFAULT_BASE_URL = 'https://api.renshuu.org/v1'

/** Give up on a request after this long, so a hung call can't stall CI. */
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Error thrown for any failed API call.
 *
 * Extending Error (rather than throwing a plain string) means `catch` blocks
 * can check `instanceof RenshuuApiError` and read the status code, which is how
 * the snapshot script distinguishes "bad key" from "renshuu is down".
 */
export class RenshuuApiError extends Error {
  /** HTTP status, or undefined if the request never got a response at all. */
  status?: number
  /** The path that failed, e.g. "/profile". */
  path: string
  /** Start of the response body, when there was one — useful for debugging. */
  body?: string

  constructor(
    message: string,
    details: { status?: number; path: string; body?: string },
  ) {
    super(message)
    this.name = 'RenshuuApiError'
    this.status = details.status
    this.path = details.path
    this.body = details.body
  }
}

/**
 * Coerces a value to a number, defaulting to 0 for anything unusable.
 *
 * The Renshuu API is inconsistent about this: numeric fields come back as JSON
 * strings some of the time (`"7"`) and as real numbers other times (`0`) —
 * sometimes both within a single array. Left alone that bites later in ways
 * that are annoying to trace, because `"7" + 1` is `"71"` in JavaScript, so a
 * chart or a sum silently produces nonsense instead of failing.
 */
function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Runs every value of an object through {@link toNumber}, keeping the keys.
 *
 * Used for the flat all-numeric objects the API returns (study counts, streaks,
 * JLPT percentages) so a stringly-typed value anywhere in them is neutralised.
 */
function toNumberRecord<T>(source: unknown): T {
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries((source ?? {}) as object)) {
    result[key] = toNumber(value)
  }
  return result as T
}

export interface RenshuuClientOptions {
  /** Override the API base URL. Only useful for testing. */
  baseUrl?: string
  /** Per-request timeout in milliseconds. Defaults to 15s. */
  timeoutMs?: number
}

/**
 * Creates a client bound to one API key.
 *
 * Get your key from renshuu under **Tools -> Renshuu API**. Keep it in a local
 * `.env` file (already gitignored) and in the `RENSHUU_API_KEY` repo secret for
 * CI — never inline it here.
 */
export function createRenshuuClient(
  apiKey: string,
  options: RenshuuClientOptions = {},
) {
  // Fail loudly and immediately on a missing key. Without this the API just
  // returns a 401 later, which is a much more confusing thing to debug.
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'A Renshuu API key is required. Set RENSHUU_API_KEY in your .env file ' +
        '(local) or as a repository secret (CI).',
    )
  }

  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  /**
   * Shared plumbing for every endpoint: attaches auth, enforces the timeout,
   * turns failures into RenshuuApiError, and parses the JSON body.
   *
   * The `<T>` is a generic type parameter — callers say what shape they expect
   * back and get a typed result. Note that TypeScript trusts that claim; it
   * does not validate the response at runtime. `npm run check-api` is what
   * actually verifies the real data matches these types.
   */
  async function request<T>(path: string): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (cause) {
      // Network-level failure: DNS, connection refused, or our timeout firing.
      const reason =
        cause instanceof Error && cause.name === 'TimeoutError'
          ? `timed out after ${timeoutMs}ms`
          : `network error: ${cause instanceof Error ? cause.message : String(cause)}`
      throw new RenshuuApiError(`Request to ${path} ${reason}`, { path })
    }

    if (!response.ok) {
      // Read the body for context, but never let that read throw and mask the
      // real error — a failed response may have no readable body at all.
      const body = await response.text().catch(() => '')
      const hint =
        response.status === 401 || response.status === 403
          ? ' (check that RENSHUU_API_KEY is set and still valid)'
          : ''
      throw new RenshuuApiError(
        `Renshuu API returned ${response.status} ${response.statusText} for ${path}${hint}`,
        { status: response.status, path, body: body.slice(0, 500) },
      )
    }

    try {
      return (await response.json()) as T
    } catch {
      throw new RenshuuApiError(`Response from ${path} was not valid JSON`, {
        status: response.status,
        path,
      })
    }
  }

  return {
    /**
     * `GET /v1/profile` — level, today's study counts, JLPT progress, streaks.
     *
     * Despite the name this is the "stats" endpoint; there is no `/v1/stats`.
     */
    async getProfile(): Promise<RenshuuProfile> {
      const data = await request<RenshuuProfile>('/profile')

      // Normalise every numeric group, since the API mixes strings and numbers.
      const levels = data.level_progress_percs
      return {
        ...data,
        adventure_level: toNumber(data.adventure_level),
        studied: toNumberRecord<StudiedCounts>(data.studied),
        api_usage: toNumberRecord<ApiUsage>(data.api_usage),
        level_progress_percs: {
          vocab: toNumberRecord(levels?.vocab),
          kanji: toNumberRecord(levels?.kanji),
          grammar: toNumberRecord(levels?.grammar),
          sent: toNumberRecord(levels?.sent),
        },
        streaks: {
          vocab: toNumberRecord(data.streaks?.vocab),
          kanji: toNumberRecord(data.streaks?.kanji),
          grammar: toNumberRecord(data.streaks?.grammar),
          sent: toNumberRecord(data.streaks?.sent),
          conj: toNumberRecord(data.streaks?.conj),
          aconj: toNumberRecord(data.streaks?.aconj),
        },
      }
    },

    /**
     * `GET /v1/schedule` — every study schedule with its term counts.
     *
     * Note the singular path: there is no `/v1/schedules`.
     */
    async getSchedules(): Promise<RenshuuScheduleList> {
      const data = await request<RenshuuScheduleList>('/schedule')

      // Normalise ids to strings (they're used as keys in history.json) and
      // every count to a real number.
      const schedules: RenshuuSchedule[] = (data.schedules ?? []).map(
        (schedule) => ({
          ...schedule,
          id: String(schedule.id),
          is_frozen: toNumber(schedule.is_frozen),
          today: {
            review: toNumber(schedule.today?.review),
            new: toNumber(schedule.today?.new),
          },
          // This array is the worst offender for mixed string/number values.
          upcoming: (schedule.upcoming ?? []).map(
            (entry): UpcomingReviews => ({
              days_in_future: toNumber(entry.days_in_future),
              terms_to_review: toNumber(entry.terms_to_review),
            }),
          ),
          terms: toNumberRecord(schedule.terms),
          new_terms: toNumberRecord(schedule.new_terms),
        }),
      )

      return { schedules }
    },
  }
}

/** The client object returned by {@link createRenshuuClient}. */
export type RenshuuClient = ReturnType<typeof createRenshuuClient>
