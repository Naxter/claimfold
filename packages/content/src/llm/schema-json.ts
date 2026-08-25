import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

/**
 * Zod schema → JSON Schema the structured-output APIs will actually accept.
 *
 * Schemas are authored once in Zod and used twice: sent to the provider to
 * constrain generation, and used locally to parse the response. Keeping a
 * hand-written JSON Schema in sync with a Zod validator is a bug factory, so
 * it is generated instead.
 *
 * The sanitising pass exists because structured-output implementations support
 * only a subset of JSON Schema. Sending an unsupported keyword is a 400, and
 * the message points at the schema rather than at the `.min(3)` in the Zod
 * definition that produced it — an unpleasant thing to debug at generation
 * time. Stripped constraints are still enforced, because the response is
 * parsed with the original Zod schema afterwards.
 */

/**
 * Keywords no structured-output implementation reliably honours.
 * Enforced client-side by Zod instead.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'patternProperties',
  'default',
])

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize)
  if (!node || typeof node !== 'object') return node

  const input = node as Record<string, unknown>
  const output: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue
    output[key] = sanitize(value)
  }

  if (output['type'] === 'object') {
    // Both are mandatory for strict structured outputs. Without
    // additionalProperties:false the request is rejected; without a complete
    // `required` list the model may silently omit fields, and a missing
    // `verdict` on a fact-check is a far worse failure than a loud 400.
    output['additionalProperties'] = false

    const properties = output['properties']
    if (properties && typeof properties === 'object') {
      const all = Object.keys(properties)
      const wasRequired = new Set(
        Array.isArray(input['required']) ? (input['required'] as string[]) : all,
      )

      // Strict mode has no notion of an optional property — everything must be
      // listed as required. So a field that was optional in Zod becomes
      // required-but-nullable: the model must emit the key, and `null` is how
      // it says "not applicable". Without this, optional fields like a source
      // quote would become mandatory prose and the model would invent them.
      const props = properties as Record<string, unknown>
      for (const key of all) {
        if (!wasRequired.has(key)) props[key] = makeNullable(props[key])
      }

      output['required'] = all
    }
  }

  return output
}

/** Allow `null` alongside whatever the property already permits. */
function makeNullable(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  const node = schema as Record<string, unknown>

  if (typeof node['type'] === 'string') {
    return { ...node, type: [node['type'], 'null'] }
  }
  if (Array.isArray(node['type'])) {
    return node['type'].includes('null')
      ? node
      : { ...node, type: [...(node['type'] as string[]), 'null'] }
  }
  if (Array.isArray(node['anyOf'])) {
    return { ...node, anyOf: [...(node['anyOf'] as unknown[]), { type: 'null' }] }
  }

  return { anyOf: [node, { type: 'null' }] }
}

export function toJsonSchema(schema: z.ZodType<unknown>, name = 'Response'): Record<string, unknown> {
  const raw = zodToJsonSchema(schema, {
    name,
    // Inline everything. $ref/$defs indirection is supported unevenly across
    // providers, and these schemas are small enough that duplication is free.
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>

  // zodToJsonSchema wraps the result in { $ref, definitions: { [name]: … } }
  // when given a name; unwrap to the bare schema the API expects.
  const definitions = raw['definitions'] as Record<string, unknown> | undefined
  const unwrapped = definitions?.[name] ?? raw

  const clean = sanitize(unwrapped) as Record<string, unknown>
  delete clean['$schema']
  delete clean['definitions']
  delete clean['$ref']

  return clean
}
