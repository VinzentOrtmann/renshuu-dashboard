/**
 * Verifies that the real Renshuu API matches the types in src/types/renshuu.ts.
 *
 * Those types were written from renshuu's OpenAPI spec, which was last updated
 * in mid-2024 — so it's worth confirming against a live account before building
 * anything on top of it. This script fetches your profile and schedules and
 * reports any field that the docs promised but the server didn't send (or vice
 * versa).
 *
 * Run it with:
 *   npm run check-api
 *
 * It needs a `.env` file in the project root containing:
 *   RENSHUU_API_KEY=your_key_here
 *
 * Get that key from renshuu under Tools -> Renshuu API. `.env` is gitignored.
 */

import { createRenshuuClient, RenshuuApiError } from '../src/api/renshuu.ts'

/** Fields src/types/renshuu.ts expects on each object, to diff against reality. */
const EXPECTED = {
  profile: [
    'id',
    'real_name',
    'adventure_level',
    'user_length',
    'kao',
    'studied',
    'level_progress_percs',
    'streaks',
    'api_usage',
  ],
  studied: [
    'today_all',
    'today_vocab',
    'today_grammar',
    'today_kanji',
    'today_sent',
    'today_conj',
    'today_aconj',
    'total',
    'total_vocab',
    'total_kanji',
    'total_grammar',
    'total_sent',
  ],
  schedule: [
    'id',
    'name',
    'booktype',
    'is_frozen',
    'today',
    'upcoming',
    'terms',
    'new_terms',
  ],
  scheduleTerms: [
    'total_count',
    'studied_count',
    'unstudied_count',
    'hidden_count',
  ],
}

/**
 * Compares the keys actually present on an object against the ones we expect,
 * printing anything that doesn't line up.
 *
 * Returns true when everything matched, so main() can set the exit code.
 */
function compareKeys(
  label: string,
  actual: object | undefined,
  expected: string[],
): boolean {
  if (actual === undefined || actual === null) {
    console.log(`  ${label}: MISSING entirely`)
    return false
  }

  const actualKeys = Object.keys(actual)
  const missing = expected.filter((key) => !actualKeys.includes(key))
  const extra = actualKeys.filter((key) => !expected.includes(key))

  if (missing.length === 0 && extra.length === 0) {
    console.log(`  ${label}: OK (${actualKeys.length} fields)`)
    return true
  }

  console.log(`  ${label}:`)
  if (missing.length > 0) {
    // These break our types — code reading them would get undefined at runtime.
    console.log(`    MISSING (typed but not sent): ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    // These are harmless, but may be data worth capturing in the snapshot.
    console.log(`    EXTRA   (sent but not typed): ${extra.join(', ')}`)
  }
  return missing.length === 0
}

async function main() {
  const apiKey = process.env.RENSHUU_API_KEY

  if (!apiKey) {
    console.error('RENSHUU_API_KEY is not set.')
    console.error('Create a .env file in the project root containing:')
    console.error('  RENSHUU_API_KEY=your_key_here')
    process.exit(1)
  }

  const client = createRenshuuClient(apiKey)
  let allMatched = true

  console.log('Fetching GET /v1/profile ...')
  const profile = await client.getProfile()
  // Deliberately not printing real_name or kao — no need to put personal
  // details in CI logs or a screenshot.
  console.log(`  adventure_level: ${profile.adventure_level}`)
  console.log(`  studied today (all): ${profile.studied?.today_all}`)
  console.log(
    `  lifetime totals: ${profile.studied?.total} ` +
      `(vocab ${profile.studied?.total_vocab}, kanji ${profile.studied?.total_kanji}, ` +
      `grammar ${profile.studied?.total_grammar}, sentences ${profile.studied?.total_sent})`,
  )
  console.log(
    `  api usage: ${profile.api_usage?.calls_today} of ${profile.api_usage?.daily_allowance} calls today`,
  )
  allMatched = compareKeys('profile', profile, EXPECTED.profile) && allMatched
  allMatched = compareKeys('profile.studied', profile.studied, EXPECTED.studied) && allMatched
  console.log(
    `  level_progress_percs categories: ${Object.keys(profile.level_progress_percs ?? {}).join(', ')}`,
  )
  console.log(
    `  streaks categories: ${Object.keys(profile.streaks ?? {}).join(', ')}`,
  )

  console.log('\nFetching GET /v1/schedule ...')
  const { schedules } = await client.getSchedules()
  console.log(`  ${schedules.length} schedule(s) found`)

  if (schedules.length === 0) {
    console.log('  (no schedules to inspect — create one in renshuu first)')
  } else {
    // One representative schedule is enough to validate the shape.
    const first = schedules[0]
    allMatched = compareKeys('schedule[0]', first, EXPECTED.schedule) && allMatched
    allMatched =
      compareKeys('schedule[0].terms', first.terms, EXPECTED.scheduleTerms) &&
      allMatched

    // The total that the projection maths will extrapolate from.
    const studied = schedules.reduce((sum, s) => sum + (s.terms?.studied_count ?? 0), 0)
    const total = schedules.reduce((sum, s) => sum + (s.terms?.total_count ?? 0), 0)
    console.log(`\n  Terms studied across all schedules: ${studied} of ${total}`)
    console.log('  Per schedule:')
    for (const s of schedules) {
      const frozen = s.is_frozen ? ' [frozen]' : ''
      console.log(
        `    [${s.booktype}] ${s.name}${frozen}: ${s.terms?.studied_count ?? '?'}/${s.terms?.total_count ?? '?'} studied, ${s.today?.review ?? '?'} due today`,
      )
    }

    // Guards against the mixed string/number problem regressing: if the client
    // ever stops coercing, these sums turn into concatenated strings.
    const upcomingValues = schedules.flatMap((s) =>
      (s.upcoming ?? []).flatMap((u) => [u.days_in_future, u.terms_to_review]),
    )
    const badTypes = upcomingValues.filter((v) => typeof v !== 'number')
    console.log(
      badTypes.length === 0
        ? `\n  Numeric coercion: OK (${upcomingValues.length} upcoming values all numbers)`
        : `\n  Numeric coercion: FAILED — ${badTypes.length} non-number values`,
    )
    if (badTypes.length > 0) allMatched = false
  }

  console.log(
    allMatched
      ? '\nAll expected fields present — the types match your account.'
      : '\nSome expected fields are missing. src/types/renshuu.ts needs updating.',
  )
  process.exit(allMatched ? 0 : 1)
}

main().catch((error: unknown) => {
  if (error instanceof RenshuuApiError) {
    console.error(`\nAPI request failed: ${error.message}`)
    if (error.body) console.error(`Response body: ${error.body}`)
  } else {
    console.error('\nUnexpected error:', error)
  }
  process.exit(1)
})
