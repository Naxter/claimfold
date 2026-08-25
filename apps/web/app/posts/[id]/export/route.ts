import { auditRecordToCsv, buildAuditRecord } from '../../../../lib/audit-record.ts'
import { isResponse, requireSessionOr401 } from '../../../../lib/session.ts'

/**
 * GET /posts/{id}/export?format=json|csv
 *
 * The editorial record for one post, in a form you can hand to someone else.
 * A route handler rather than a server action because the result is a file
 * download, and because "the auditable trail is exportable" stops being a
 * claim the moment there is a URL that returns it.
 */

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await requireSessionOr401()
  if (isResponse(session)) return session

  const { id } = await params
  const format = new URL(request.url).searchParams.get('format') ?? 'json'

  if (format !== 'json' && format !== 'csv') {
    return Response.json({ error: 'format must be json or csv' }, { status: 400 })
  }

  const record = await buildAuditRecord(session.orgId, id)
  if (!record) return Response.json({ error: 'not found' }, { status: 404 })

  // The id, not the title: a title is model-written free text, and putting it
  // in a Content-Disposition filename is a header-injection hazard for no gain.
  const stem = `record-${record.post.id}`

  if (format === 'csv') {
    return new Response(auditRecordToCsv(record), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${stem}.csv"`,
        'cache-control': 'no-store',
      },
    })
  }

  return new Response(JSON.stringify(record, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${stem}.json"`,
      'cache-control': 'no-store',
    },
  })
}
