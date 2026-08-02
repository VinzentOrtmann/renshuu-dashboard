/**
 * Working out which study day a moment in time belongs to.
 *
 * This is a small amount of code that has caused two real bugs in this project,
 * which is why it lives here with tests rather than inline in the snapshot
 * script:
 *
 *   1. Stamping snapshots in UTC while renshuu resets on local time, so a run
 *      just after the boundary recorded an empty day.
 *   2. Assuming the boundary was midnight when renshuu actually rolls over at
 *      03:00, so anything captured between 00:00 and 03:00 was filed a day late.
 *
 * Both were invisible in the data until someone noticed a number looked wrong,
 * which is the worst kind of bug for an archive that is supposed to be the
 * permanent record.
 */

/** renshuu's default rollover: a new study day begins at 03:00 local time. */
export const DEFAULT_DAY_START_HOUR = 3

/**
 * Formats an instant as YYYY-MM-DD in the given timezone.
 *
 * Built from `Intl` parts rather than by slicing an ISO string, because
 * `toISOString()` is always UTC and would give the wrong calendar date for
 * anyone not on UTC for part of the day.
 */
export function formatDateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)

  const find = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00'

  return `${find('year')}-${find('month')}-${find('day')}`
}

/**
 * Which study day an instant belongs to, as YYYY-MM-DD.
 *
 * renshuu's counters roll over at `dayStartHour` local time, so between
 * midnight and that hour it is still reporting the previous day's numbers.
 * Shifting the instant back by that many hours before reading the calendar date
 * maps that window onto the day it actually belongs to.
 */
export function studyDate(
  instant: Date,
  timeZone: string,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
): string {
  const shifted = new Date(instant.getTime() - dayStartHour * 60 * 60 * 1000)
  return formatDateInZone(shifted, timeZone)
}
