export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }

/** A clock that only moves when told to. Used by tests and the demo. */
export function fixedClock(start: Date): Clock & { set(date: Date): void; advance(ms: number): void } {
  let current = new Date(start)
  return {
    now: () => new Date(current),
    set: (date) => {
      current = new Date(date)
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms)
    },
  }
}

/** "2026-11-13" for a date, in UTC. */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10)

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000)
