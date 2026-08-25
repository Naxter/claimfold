import { describe, expect, it } from 'vitest'

import {
  invitationPathFrom,
  invitationReturnTo,
  invitationTokenFromReturnTo,
} from '../return-to.ts'

const TOKEN = 'a'.repeat(43)

describe('invitation return destinations', () => {
  it('accepts only an internal, token-shaped invitation path', () => {
    const target = `/invite/${TOKEN}`

    expect(invitationReturnTo(target)).toBe(target)
    expect(invitationTokenFromReturnTo(target)).toBe(TOKEN)
  })

  it('rejects general paths and external redirect shapes', () => {
    for (const value of [
      '/',
      '/settings',
      '//evil.example',
      'https://evil.example',
      `/invite/${TOKEN}?next=//evil.example`,
      '/invite/not-a-real-token',
    ]) {
      expect(invitationReturnTo(value), value).toBeNull()
    }
  })
})

/**
 * What someone actually pastes into the recovery screen.
 *
 * An invitation arrives as a whole URL in a chat message, so the input is a
 * URL far more often than a path — and a person who has just been told they
 * belong to no workspace is the last person who should be asked to edit one.
 */
describe('an invitation link pasted by hand', () => {
  const TARGET = `/invite/${TOKEN}`

  it('accepts the whole link, the path alone, and surrounding whitespace', () => {
    expect(invitationPathFrom(`https://studio.example.com${TARGET}`)).toBe(TARGET)
    expect(invitationPathFrom(`http://localhost:3100${TARGET}`)).toBe(TARGET)
    expect(invitationPathFrom(TARGET)).toBe(TARGET)
    expect(invitationPathFrom(`  ${TARGET}\n`)).toBe(TARGET)
  })

  it('keeps only the path, so a foreign origin cannot become a destination', () => {
    // The token is the secret, not the host. Trying someone else's link against
    // this install is harmless — it simply will not be found — and refusing it
    // would only puzzle an operator who runs the app on two hostnames.
    expect(invitationPathFrom(`https://evil.example${TARGET}`)).toBe(TARGET)
  })

  it('refuses anything that is not an invitation path', () => {
    for (const value of [
      '',
      '   ',
      'https://evil.example/',
      'https://evil.example/settings',
      `javascript:alert(1)//${TARGET}`,
      'not a link at all',
      `https://studio.example.com/invite/${'a'.repeat(12)}`,
    ]) {
      expect(invitationPathFrom(value), JSON.stringify(value)).toBeNull()
    }
  })
})
