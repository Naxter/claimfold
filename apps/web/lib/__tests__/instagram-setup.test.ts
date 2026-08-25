import { describe, expect, it } from 'vitest'

import { appUrlIsPublishable, canPublish, tokenIsHealthy, type ReadinessState } from '../instagram-setup.ts'

describe('publishing preflight', () => {
  it('requires a public HTTPS application address', () => {
    expect(appUrlIsPublishable({ APP_URL: 'http://localhost:3100' }).ok).toBe(false)
    expect(appUrlIsPublishable({ APP_URL: 'https://192.168.1.20' }).ok).toBe(false)
    expect(appUrlIsPublishable({ APP_URL: 'https://172.20.0.8' }).ok).toBe(false)
    expect(appUrlIsPublishable({ APP_URL: 'https://studio.example.test' }).ok).toBe(true)
  })

  it('makes a public app address a real publish precondition', () => {
    const ready: ReadinessState = {
      appUrl: { ok: true },
      asset: { ok: true },
      account: {
        id: 'account',
        username: 'test-account',
        igUserId: 'ig-user',
        tokenExpiresAt: new Date(Date.now() + 10 * 86_400_000),
      },
      daysLeft: 10,
    }

    expect(tokenIsHealthy(7)).toBe(false)
    expect(tokenIsHealthy(8)).toBe(true)
    expect(canPublish(ready)).toBe(true)
    expect(canPublish({ ...ready, appUrl: { ok: false } })).toBe(false)
  })
})
