import { redact } from '@claimfold/crypto'

/**
 * Worker logging, as one JSON object per line.
 *
 * It was `console.log` with an ISO-8601 prefix and a free-text message. That is
 * readable over someone's shoulder and useless everywhere else: this process is
 * the only thing awake at 18:00, so its output is the sole record of why a
 * publish failed — and "grep the terminal" is not a way to answer that a week
 * later. One JSON object per line is what every log shipper already understands,
 * and Docker's json-file driver passes it through untouched.
 *
 * Levels exist so an operator can filter. `LOG_LEVEL` was documented in
 * `.env.example` and read by nothing at all; it is read here now, and the
 * variable is back in the sample file because it finally does something.
 *
 * Everything still goes through `redact`, for the reason it always did: Graph
 * API errors echo request parameters, which is how a live access token ends up
 * in a log file.
 */

export const LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type Level = (typeof LEVELS)[number]

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level
  const index = LEVELS.indexOf(configured)
  // An unrecognised value logs everything rather than nothing. Silence caused
  // by a typo in a config file is the worst possible failure for a logger.
  return index === -1 ? 0 : index
}

export interface LogFields {
  /** What happened, in a form worth grouping by. */
  event: string
  [key: string]: unknown
}

function emit(level: Level, fields: LogFields): void {
  if (LEVELS.indexOf(level) < threshold()) return

  const line = {
    ts: new Date().toISOString(),
    level,
    ...(redact(fields) as Record<string, unknown>),
  }

  /*
    `console.error` for warn and above so the two streams stay meaningful:
    `docker logs` interleaves them, but anything collecting stderr separately —
    or an operator running `2>errors.log` — gets the failures on their own.
  */
  const write = level === 'error' || level === 'warn' ? console.error : console.log

  try {
    write(JSON.stringify(line))
  } catch {
    // A value that will not serialise (a cycle redact missed, a BigInt) must
    // not take the tick down. Say what we can.
    write(JSON.stringify({ ts: line.ts, level, event: fields.event, unserialisable: true }))
  }
}

export const log = {
  debug: (fields: LogFields) => emit('debug', fields),
  info: (fields: LogFields) => emit('info', fields),
  warn: (fields: LogFields) => emit('warn', fields),
  error: (fields: LogFields) => emit('error', fields),
}
