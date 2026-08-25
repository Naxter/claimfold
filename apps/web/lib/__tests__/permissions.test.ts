import { describe, expect, it } from 'vitest'

import { can, isReadOnly } from '../permissions.ts'

/**
 * The permission model, which was decorative.
 *
 * `member.role` was resolved into every session and `rg "session.role"` matched
 * nothing anywhere in the product — so a member stored as `viewer` could approve
 * a post, override a claim verdict and schedule a publish to a real audience
 * under somebody else's name. The enum, the column and the field all existed;
 * nothing asked.
 */

describe('what each role may do', () => {
  it('lets owners and admins do everything', () => {
    for (const role of ['owner', 'admin']) {
      expect(can({ role }, 'read'), role).toBe(true)
      expect(can({ role }, 'edit'), role).toBe(true)
      expect(can({ role }, 'publish'), role).toBe(true)
    }
  })

  it('lets an editor write but not sign off', () => {
    // The useful shape for a freelancer or an agency's junior: they can produce
    // and fix, and a person with responsibility decides what goes out.
    expect(can({ role: 'editor' }, 'edit')).toBe(true)
    expect(can({ role: 'editor' }, 'publish')).toBe(false)
  })

  it('lets a viewer only look', () => {
    expect(can({ role: 'viewer' }, 'read')).toBe(true)
    expect(can({ role: 'viewer' }, 'edit')).toBe(false)
    expect(can({ role: 'viewer' }, 'publish')).toBe(false)
    expect(isReadOnly({ role: 'viewer' })).toBe(true)
  })
})

describe('a role nobody has mapped', () => {
  it('gets read only rather than everything', () => {
    /*
      Fails closed, for the same reason the gate refuses a post whose channel will
      not validate: not knowing the rules is not the same as there being none.
      Better Auth lets a role string be anything, and this install's own enum
      could gain a value before the map does.
    */
    expect(can({ role: 'contributor' }, 'read')).toBe(true)
    expect(can({ role: 'contributor' }, 'edit')).toBe(false)
    expect(can({ role: 'contributor' }, 'publish')).toBe(false)
    expect(can({ role: '' }, 'publish')).toBe(false)
  })
})
