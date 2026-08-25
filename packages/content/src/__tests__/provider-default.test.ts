import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { DEFAULT_PROVIDER } from '../llm/index.ts'

/**
 * The code default, the `.env.example` default and the compose default must
 * agree.
 *
 * They did not once, and nothing broke loudly. `getProvider()` fell back to
 * anthropic while both files shipped openai, so commenting `LLM_PROVIDER` out
 * — or dropping the line while tidying a `.env` — silently moved generation to
 * a different provider, a different model tier and a different billing
 * account. The run still succeeded, which is what made it expensive.
 *
 * The comment on DEFAULT_PROVIDER has always said it is exported so a test can
 * assert this. This is that test.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (name: string) => readFileSync(resolve(repoRoot, name), 'utf8')

describe('the default provider', () => {
  it('matches what .env.example ships', () => {
    const line = read('.env.example').match(/^LLM_PROVIDER=(\S+)/m)
    expect(line?.[1]).toBe(DEFAULT_PROVIDER)
  })

  it('matches what docker-compose.yml falls back to', () => {
    // `LLM_PROVIDER: ${LLM_PROVIDER:-openai}` — the half after :- is the default.
    const line = read('docker-compose.yml').match(/LLM_PROVIDER:\s*\$\{LLM_PROVIDER:-(\w+)\}/)
    expect(line?.[1]).toBe(DEFAULT_PROVIDER)
  })
})
