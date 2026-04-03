type SlidingWindowRateLimiterOptions = {
  now?: () => number
}

type FailureState = {
  failedAt: number[]
  lockedUntil: number | null
}

type LockoutState = {
  locked: boolean
  remainingMs: number
}

const SHORT_WINDOW_MS = 15 * 60 * 1000
const SHORT_LOCK_MS = 5 * 60 * 1000
const LONG_WINDOW_MS = 60 * 60 * 1000
const LONG_LOCK_MS = 30 * 60 * 1000
const SHORT_THRESHOLD = 5
const LONG_THRESHOLD = 10

const pruneFailures = (failedAt: number[], now: number): number[] =>
  failedAt.filter((attemptAt) => now - attemptAt <= LONG_WINDOW_MS)

export const formatLockoutMessage = (remainingMs: number): string => {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  return `Tài khoản tạm thời bị khóa. Vui lòng thử lại sau ${minutes} phút.`
}

export class SlidingWindowRateLimiter {
  private readonly entries = new Map<string, FailureState>()

  private readonly now: () => number

  constructor(options: SlidingWindowRateLimiterOptions = {}) {
    this.now = options.now ?? Date.now
  }

  getLockout(identifier: string): LockoutState {
    const now = this.now()
    const state = this.entries.get(identifier)
    if (!state) {
      return { locked: false, remainingMs: 0 }
    }

    state.failedAt = pruneFailures(state.failedAt, now)

    if (state.lockedUntil && state.lockedUntil > now) {
      return {
        locked: true,
        remainingMs: state.lockedUntil - now
      }
    }

    state.lockedUntil = null

    if (state.failedAt.length === 0) {
      this.entries.delete(identifier)
    }

    return { locked: false, remainingMs: 0 }
  }

  recordFailure(identifier: string): void {
    const now = this.now()
    const state = this.entries.get(identifier) ?? {
      failedAt: [],
      lockedUntil: null
    }

    state.failedAt = pruneFailures(state.failedAt, now)
    state.failedAt.push(now)

    const failuresInShortWindow = state.failedAt.filter((attemptAt) => now - attemptAt <= SHORT_WINDOW_MS).length
    const failuresInLongWindow = state.failedAt.length

    if (failuresInLongWindow >= LONG_THRESHOLD) {
      state.lockedUntil = now + LONG_LOCK_MS
    } else if (failuresInShortWindow >= SHORT_THRESHOLD) {
      state.lockedUntil = now + SHORT_LOCK_MS
    }

    this.entries.set(identifier, state)
  }

  reset(identifier: string): void {
    this.entries.delete(identifier)
  }
}
