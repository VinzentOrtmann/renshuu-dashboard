/**
 * TypeScript types for the Renshuu API responses.
 *
 * These were derived from the live OpenAPI spec at https://api.renshuu.org/api-docs
 * (the Swagger UI at https://api.renshuu.org/docs/ renders that same spec).
 *
 * A caveat worth knowing: that spec was last updated in mid-2024, and its
 * examples are illustrative rather than guaranteed. Treat these types as "what
 * the docs promise", not "what the server definitely sends". `npm run check-api`
 * fetches your real account data and reports any mismatch — run it before
 * relying on a field.
 */

/**
 * The six things renshuu tracks study activity for.
 *
 * `sent` is sentences; `conj` is conjugation practice and `aconj` is adjective
 * conjugation. The API uses these exact abbreviations as key suffixes and as
 * object keys, so they're spelled out here once and reused below.
 */
export type StudyCategory =
  | 'vocab'
  | 'grammar'
  | 'kanji'
  | 'sent'
  | 'conj'
  | 'aconj'

/**
 * JLPT levels, hardest (n1) to easiest (n5).
 *
 * renshuu also exposes an `n6` bucket for vocab, which is its own
 * below-N5 grouping rather than a real JLPT level, plus `kana`/`kata`
 * (hiragana/katakana) buckets. Those only appear on vocab — see
 * `VocabProgressPercentages`.
 */
export type JlptLevel = 'n1' | 'n2' | 'n3' | 'n4' | 'n5'

/** Percentage (0-100) complete for each JLPT level. */
export type JlptProgressPercentages = Record<JlptLevel, number>

/**
 * Vocab progress has extra buckets beyond the standard JLPT five.
 */
export interface VocabProgressPercentages extends JlptProgressPercentages {
  /** renshuu's own "below N5" grouping. */
  n6: number
  /** Hiragana. */
  kana: number
  /** Katakana. */
  kata: number
}

/** Streak counters, reported separately for each study category. */
export interface CategoryStreaks {
  /** Current run of correct answers. */
  correct_in_a_row: number
  /** Best-ever run of correct answers. */
  correct_in_a_row_alltime: number
  /** Current run of consecutive days studied. */
  days_studied_in_a_row: number
  /** Best-ever run of consecutive days studied. */
  days_studied_in_a_row_alltime: number
}

/**
 * Study counts, broken down by category.
 *
 * The `today_*` fields reset every day — which is exactly why we snapshot them
 * daily, since renshuu doesn't hand you the historical series. They drive the
 * activity heatmap.
 *
 * The `total_*` fields are cumulative lifetime counts. They aren't in renshuu's
 * OpenAPI spec at all but the server does send them, and they're the best basis
 * for the pace projections: one number per category that only ever goes up.
 */
export interface StudiedCounts {
  /** All categories combined. */
  today_all: number
  today_vocab: number
  today_grammar: number
  today_kanji: number
  today_sent: number
  today_conj: number
  today_aconj: number

  /**
   * Lifetime total across categories. Observed to equal the four `total_*`
   * fields below summed — note there are no conjugation totals.
   */
  total: number
  total_vocab: number
  total_kanji: number
  total_grammar: number
  total_sent: number
}

/**
 * API rate-limit info. Undocumented, but returned on every profile call.
 *
 * The allowance is per day and generous (2000 observed), so a once-daily
 * snapshot is nowhere near it. Worth recording anyway so a runaway loop is
 * visible in the history rather than silently getting throttled.
 */
export interface ApiUsage {
  calls_today: number
  daily_allowance: number
}

/** Response shape of `GET /v1/profile`. */
export interface RenshuuProfile {
  id: number
  real_name: string
  /** renshuu's gamified level, shown as "level" in its own UI. */
  adventure_level: number
  /** Human-readable account age, e.g. "10 years ago". Not a date. */
  user_length: string
  /** URL of the user's avatar image. */
  kao: string
  studied: StudiedCounts
  api_usage: ApiUsage
  level_progress_percs: {
    vocab: VocabProgressPercentages
    kanji: JlptProgressPercentages
    grammar: JlptProgressPercentages
    sent: JlptProgressPercentages
  }
  streaks: Record<StudyCategory, CategoryStreaks>
}

/**
 * How many terms are due in a schedule on some future day.
 *
 * Both fields arrive from the server as strings *sometimes* — "7" and 0 have
 * been seen in the same array. The API client coerces them to numbers, so by
 * the time this type is handed to you they really are numbers.
 */
export interface UpcomingReviews {
  /** 1 = tomorrow, 2 = the day after, and so on. */
  days_in_future: number
  terms_to_review: number
}

/**
 * Which kind of material a schedule drills. Undocumented but always present.
 *
 * This is what makes a per-schedule category breakdown possible — without it
 * you'd be guessing from the schedule's name.
 */
export type ScheduleBookType = StudyCategory

/** A single study schedule (renshuu's name for an SRS deck). */
export interface RenshuuSchedule {
  /**
   * The spec declares this a string while showing a numeric example, so the
   * server may well send a number. The API client normalises it to a string.
   */
  id: string
  name: string
  /**
   * Category of material. Not in the OpenAPI spec; observed values are
   * vocab, kanji, grammar, sent and conj.
   */
  booktype: ScheduleBookType
  /** 0 or 1 — frozen schedules are paused and stop surfacing reviews. */
  is_frozen: number
  today: {
    /** Terms due for review today. */
    review: number
    /** New terms scheduled to be introduced today. */
    new: number
  }
  upcoming: UpcomingReviews[]
  terms: {
    total_count: number
    /**
     * Terms encountered at least once.
     *
     * Don't sum this across schedules to get a lifetime total — use
     * `RenshuuProfile.studied.total_*` for that. The two disagree (4166 vs
     * 3890 on a real account) because a term can sit in several schedules and
     * gets counted once per schedule here. This field is per-deck progress;
     * `studied.total_*` is the account-wide truth.
     */
    studied_count: number
    unstudied_count: number
    hidden_count: number
  }
  new_terms: {
    /** New terms learned today. */
    today_count: number
    /** New terms learned in the last 7 days. */
    rolling_week_count: number
  }
}

/** Response shape of `GET /v1/schedule`. */
export interface RenshuuScheduleList {
  schedules: RenshuuSchedule[]
}
