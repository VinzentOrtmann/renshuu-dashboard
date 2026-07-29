/**
 * Pace calculation and progress projection.
 *
 * This is the analysis renshuu doesn't do for you: given the archive, how fast
 * are you actually moving, and when does that pace put you at a target?
 *
 * Everything here is pure — dates and numbers in, numbers out, no fetching and
 * no React — which is what makes it unit-testable. See projections.test.ts.
 *
 *
 * ## The honesty problem, and how this file handles it
 *
 * A projection is trivially easy to compute and trivially easy to make
 * meaningless. Two days of data will happily yield "you'll finish N3 on 4 March
 * 2027", stated to the day, resting on nothing.
 *
 * So every function here can refuse. `projectToTarget` returns a tagged status
 * rather than a number, and the caller has to handle `insufficient-data` and
 * `no-progress` explicitly — it can't accidentally render a confident date that
 * isn't supported by the data. Projections also come with a range derived from
 * the fit's own error, not just a single date.
 */

/** A dated measurement — one archive value on one day. */
export interface DataPoint {
  /** YYYY-MM-DD. */
  date: string
  value: number
}

/**
 * Days from one YYYY-MM-DD to another.
 *
 * Built with `Date.UTC` from the parsed parts rather than `new Date(string)`,
 * so the result can't shift by a day depending on the reader's timezone or on
 * a daylight-saving boundary falling inside the range.
 */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const msPerDay = 24 * 60 * 60 * 1000
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / msPerDay
}

/** Adds a whole number of days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const result = new Date(Date.UTC(y, m - 1, d + days))
  return result.toISOString().slice(0, 10)
}

/** The result of fitting a straight line through the points. */
export interface LinearFit {
  /** How much the value changes per day. */
  slopePerDay: number
  /** Value at the first point, per the fitted line. */
  intercept: number
  /**
   * How well the line explains the data, 0 to 1.
   *
   * High r² does NOT mean the projection is right — it only means the past was
   * close to linear. Studying is bursty, so treat a low value as a warning and
   * a high value as the absence of one, nothing stronger.
   */
  rSquared: number
  /**
   * Uncertainty in the slope. Used to turn a single projected date into a
   * range, which is a more honest thing to show than one date.
   */
  slopeStdError: number
  pointCount: number
  /** Days from the first point to the last. */
  spanDays: number
}

/**
 * Ordinary least-squares fit of value against days elapsed.
 *
 * Returns null when a line is meaningless: fewer than two points, or every
 * point on the same day (which would divide by zero).
 */
export function fitLinear(points: DataPoint[]): LinearFit | null {
  if (points.length < 2) return null

  const origin = points[0].date
  const xs = points.map((p) => daysBetween(origin, p.date))
  const ys = points.map((p) => p.value)
  const n = points.length

  const meanX = xs.reduce((sum, x) => sum + x, 0) / n
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n

  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
  }

  // Every point landed on the same date — there is no time axis to fit against.
  if (sxx === 0) return null

  const slopePerDay = sxy / sxx
  const intercept = meanY - slopePerDay * meanX

  // Total and residual sum of squares, for r² and the slope's standard error.
  let ssTotal = 0
  let ssResidual = 0
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slopePerDay * xs[i]
    ssTotal += (ys[i] - meanY) ** 2
    ssResidual += (ys[i] - predicted) ** 2
  }

  // A flat series has zero total variance; the line explains it perfectly.
  const rSquared = ssTotal === 0 ? 1 : 1 - ssResidual / ssTotal

  // Needs at least 3 points: with exactly 2 the line passes through both and
  // there are no degrees of freedom left to estimate error from.
  const slopeStdError =
    n > 2 ? Math.sqrt(ssResidual / (n - 2) / sxx) : 0

  return {
    slopePerDay,
    intercept,
    rSquared,
    slopeStdError,
    pointCount: n,
    spanDays: xs[n - 1],
  }
}

/**
 * Keeps only points within `windowDays` of the most recent one.
 *
 * The trailing window is what makes the pace mean "how I'm going *now*". Fitting
 * all history would let an intense month a year ago hold up an estimate that no
 * longer reflects anything.
 */
export function trailingWindow(
  points: DataPoint[],
  windowDays: number,
): DataPoint[] {
  if (points.length === 0) return []
  const latest = points[points.length - 1].date
  return points.filter((p) => daysBetween(p.date, latest) <= windowDays)
}

/** Every outcome a projection can have. The caller must handle each. */
export type ProjectionResult =
  | { status: 'complete' }
  | {
      /** Not enough archive yet. Say so; don't guess. */
      status: 'insufficient-data'
      pointCount: number
      requiredPoints: number
    }
  | {
      /** Measurable, but flat or going backwards — no arrival date exists. */
      status: 'no-progress'
      perDay: number
    }
  | {
      status: 'projected'
      /** Units gained per day over the window. */
      perDay: number
      daysRemaining: number
      /** YYYY-MM-DD, from the central slope estimate. */
      date: string
      /** Range from the slope's own uncertainty, fastest to slowest. */
      earliest: string
      latest: string
      rSquared: number
      pointCount: number
      spanDays: number
    }

export interface ProjectionOptions {
  /** Only fit points within this many days of the latest. Defaults to 30. */
  windowDays?: number
  /**
   * Minimum points before a projection is offered at all. Defaults to 5.
   *
   * Set deliberately above the mathematical minimum of 2: a line through two
   * points is exact by construction and tells you nothing about whether the
   * trend is real.
   */
  minimumPoints?: number
}

/**
 * Projects when a rising series will reach `target`.
 *
 * `points` must be sorted oldest-first.
 */
export function projectToTarget(
  points: DataPoint[],
  target: number,
  options: ProjectionOptions = {},
): ProjectionResult {
  const windowDays = options.windowDays ?? 30
  const minimumPoints = options.minimumPoints ?? 5

  const latest = points.at(-1)
  if (latest && latest.value >= target) return { status: 'complete' }

  const window = trailingWindow(points, windowDays)

  if (window.length < minimumPoints) {
    return {
      status: 'insufficient-data',
      pointCount: window.length,
      requiredPoints: minimumPoints,
    }
  }

  const fit = fitLinear(window)
  if (!fit) {
    return {
      status: 'insufficient-data',
      pointCount: window.length,
      requiredPoints: minimumPoints,
    }
  }

  if (fit.slopePerDay <= 0) {
    return { status: 'no-progress', perDay: fit.slopePerDay }
  }

  // Project from the last *actual* value rather than the fitted line's endpoint.
  // The fit describes the trend; the archive describes where you really are, and
  // a projection that disagrees with the number on screen reads as a bug.
  const remaining = target - latest!.value

  const daysRemaining = Math.ceil(remaining / fit.slopePerDay)

  // A range from the slope's uncertainty. A faster slope arrives earlier, so
  // the +1 standard error bound gives `earliest` and -1 gives `latest`.
  const fastSlope = fit.slopePerDay + fit.slopeStdError
  const slowSlope = fit.slopePerDay - fit.slopeStdError

  const earliestDays = Math.ceil(remaining / fastSlope)
  // A slow bound at or below zero means "possibly never at this pace"; cap the
  // range at the central estimate rather than emitting a nonsensical date.
  const latestDays =
    slowSlope > 0 ? Math.ceil(remaining / slowSlope) : daysRemaining

  return {
    status: 'projected',
    perDay: fit.slopePerDay,
    daysRemaining,
    date: addDays(latest!.date, daysRemaining),
    earliest: addDays(latest!.date, earliestDays),
    latest: addDays(latest!.date, latestDays),
    rSquared: fit.rSquared,
    pointCount: fit.pointCount,
    spanDays: fit.spanDays,
  }
}

/**
 * Terms gained per day over the trailing window.
 *
 * Returns null when there isn't enough to measure. Used by the category
 * comparison, where the question is "which am I moving fastest on" rather than
 * "when do I arrive".
 */
export function pacePerDay(
  points: DataPoint[],
  options: ProjectionOptions = {},
): number | null {
  const window = trailingWindow(points, options.windowDays ?? 30)
  if (window.length < (options.minimumPoints ?? 5)) return null
  return fitLinear(window)?.slopePerDay ?? null
}
