import { describe, expect, it } from 'vitest'
import { SlidingWindowRateLimiter } from '../rate-limiter'

describe('SlidingWindowRateLimiter', () => {
  it('locks an identifier for 5 minutes after 5 failures within 15 minutes', () => {
    let now = Date.UTC(2026, 3, 2, 7, 0, 0)
    const limiter = new SlidingWindowRateLimiter({ now: () => now })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.recordFailure('E0112599')
    }

    expect(limiter.getLockout('E0112599')).toMatchObject({
      locked: true,
      remainingMs: 5 * 60 * 1000
    })
  })

  it('escalates to a 30 minute lock after 10 failures within 60 minutes', () => {
    let now = Date.UTC(2026, 3, 2, 7, 0, 0)
    const limiter = new SlidingWindowRateLimiter({ now: () => now })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.recordFailure('admin')
    }

    now += 5 * 60 * 1000 + 1

    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.recordFailure('admin')
    }

    expect(limiter.getLockout('admin')).toMatchObject({
      locked: true,
      remainingMs: 30 * 60 * 1000
    })
  })

  it('clears the failure counter after a successful login', () => {
    const limiter = new SlidingWindowRateLimiter()

    for (let attempt = 0; attempt < 4; attempt += 1) {
      limiter.recordFailure('user')
    }

    limiter.reset('user')

    expect(limiter.getLockout('user')).toMatchObject({
      locked: false,
      remainingMs: 0
    })
  })
})
