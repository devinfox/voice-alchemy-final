import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import OpenAI from 'openai'
import { ByeTalkAttachmentRef } from '@/lib/email/byetalk-file-utils'
import { listByeTalkFilesForEmail } from '@/lib/email/byetalk-file-utils'

let openaiInstance: OpenAI | null = null

/**
 * Resolve the caller of this route. Accepts either:
 *  - an authenticated CRM session (cookie-based) -> identity from session
 *  - a valid `x-internal-secret` header (server-to-server, e.g. calls/process)
 *    -> identity taken from a body-supplied user_id, constrained to that user.
 *
 * Returns the resolved CRM user { id, organization_id } or null when the
 * caller is unauthenticated / cannot be resolved.
 */
async function resolveCaller(
  request: NextRequest,
  bodyUserId?: string | null
): Promise<{ id: string; organizationId: string | null } | null> {
  // 1. Session auth (in-app callers)
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()
      if (profile) {
        return { id: profile.id, organizationId: null }
      }
      return { id: user.id, organizationId: null }
    }
  } catch {
    // fall through to internal-secret check
  }

  // 2. Internal secret (server-to-server callers)
  const expectedSecret = process.env.INTERNAL_API_SECRET
  const providedSecret = request.headers.get('x-internal-secret')
  if (expectedSecret && providedSecret === expectedSecret && bodyUserId) {
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('id', bodyUserId)
      .maybeSingle()
    if (profile) {
      return { id: profile.id, organizationId: null }
    }
    return { id: bodyUserId, organizationId: null }
  }

  return null
}

// Auto-expire old pending drafts (older than 7 days)
const DRAFT_EXPIRATION_DAYS = 7

async function expireOldDrafts(orgId: string | null): Promise<{ expiredCount: number }> {
  const expirationDate = new Date()
  expirationDate.setDate(expirationDate.getDate() - DRAFT_EXPIRATION_DAYS)

  const { data: expiredDrafts, error: fetchError } = await getSupabaseAdmin()
    .from('email_drafts')
    .select('id')
    .eq('status', 'pending')
    .eq('organization_id', orgId)
    .lt('created_at', expirationDate.toISOString())

  if (fetchError || !expiredDrafts || expiredDrafts.length === 0) {
    return { expiredCount: 0 }
  }

  const expiredIds = expiredDrafts.map(d => d.id)

  const { error: updateError } = await getSupabaseAdmin()
    .from('email_drafts')
    .update({
      status: 'expired',
      dismissed_at: new Date().toISOString()
    })
    .in('id', expiredIds)

  if (updateError) {
    console.error('[Email Draft API] Failed to expire old drafts:', updateError)
    return { expiredCount: 0 }
  }

  console.log(`[Email Draft API] Expired ${expiredIds.length} old drafts`)
  return { expiredCount: expiredIds.length }
}

function getOpenAI(): OpenAI | null {
  if (!openaiInstance && process.env.OPENAI_API_KEY) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

interface DraftRequest {
  user_id: string
  lead_id: string
  call_id?: string
  content_hints: string[]
  tone?: string
  document_ids?: string[]
  due_at?: string
  commitment_quote?: string
  byetalk_attachments?: ByeTalkAttachmentRef[]
}

/**
 * POST /api/email/draft
 * Generate an AI email draft based on call context and conversation history
 */
export async function POST(request: NextRequest) {
  try {
    const body: DraftRequest = await request.json()
    const {
      lead_id,
      call_id,
      content_hints,
      tone = 'professional',
      document_ids = [],
      due_at,
      commitment_quote,
      byetalk_attachments = [],
    } = body

    // Resolve the caller identity (session or internal secret). Never trust a
    // body-supplied user_id for session callers.
    const caller = await resolveCaller(request, body.user_id)
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user_id = caller.id
    const orgId = caller.organizationId

    if (!lead_id) {
      return NextResponse.json(
        { error: 'lead_id is required' },
        { status: 400 }
      )
    }

    // 1. Fetch lead info (constrained to caller org)
    const { data: lead, error: leadError } = await getSupabaseAdmin()
      .from('leads')
      .select('id, first_name, last_name, email, phone')
      .eq('id', lead_id)
      .eq('organization_id', orgId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (!lead.email) {
      return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 })
    }

    // 2. Fetch user info
    const { data: userProfile } = await getSupabaseAdmin()
      .from('profiles')
      .select('id, first_name, last_name, name, email')
      .eq('id', user_id)
      .maybeSingle()

    const userName = userProfile?.name ||
      `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim() ||
      'Vocal Coach'

    // 3. Fetch user's primary email account
    const { data: emailAccount } = await getSupabaseAdmin()
      .from('email_accounts')
      .select('id, email_address, display_name')
      .eq('user_id', user_id)
      .eq('is_primary', true)
      .single()

    // 4. Fetch call transcription if call_id provided
    let callTranscript = ''
    if (call_id) {
      const { data: call } = await getSupabaseAdmin()
        .from('calls')
        .select('transcription, ai_summary')
        .eq('id', call_id)
        .eq('organization_id', orgId)
        .single()

      if (call) {
        callTranscript = call.transcription || call.ai_summary || ''
      }
    }

    // 5. Fetch recent email history with this lead
    const { data: recentEmails } = await getSupabaseAdmin()
      .from('emails')
      .select('subject, body_text, from_address, is_inbound, created_at')
      .eq('lead_id', lead_id)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5)

    const emailHistory = recentEmails?.map(e => ({
      direction: e.is_inbound ? 'from lead' : 'to lead',
      subject: e.subject,
      snippet: (e.body_text || '').substring(0, 200),
      date: e.created_at
    })) || []

    // 6. Fetch document details if document_ids provided
    let attachmentInfo: string[] = []
    if (document_ids.length > 0) {
      const { data: docs } = await getSupabaseAdmin()
        .from('documents')
        .select('id, file_name')
        .in('id', document_ids)
        .eq('organization_id', orgId)

      attachmentInfo = docs?.map(d => d.file_name) || []
    }

    // 6b. Auto-match ByeTalk files from hints when none explicitly provided
    let resolvedByeTalkAttachments: ByeTalkAttachmentRef[] = Array.isArray(byetalk_attachments)
      ? byetalk_attachments
      : []
    if (resolvedByeTalkAttachments.length === 0 && Array.isArray(content_hints) && content_hints.length > 0) {
      const hints = content_hints
        .map((hint) => hint.toLowerCase().split(/\s+/))
        .flat()
        .filter((word) => word.length >= 3)

      const pool = await listByeTalkFilesForEmail({
        organizationId: orgId,
        query: '',
        limit: 120,
      })

      const scored = pool
        .map((item) => {
          const lowerName = item.name.toLowerCase()
          let score = 0
          hints.forEach((word) => {
            if (lowerName.includes(word)) score += 2
          })
          if (item.kind === 'document' && /(guide|doc|agreement|proposal|brand)/.test(lowerName)) score += 1
          if (item.kind === 'sheet' && /(pricing|budget|cost|rate|breakdown|sheet)/.test(lowerName)) score += 1
          if (item.kind === 'presentation' && /(deck|presentation|slides|pitch)/.test(lowerName)) score += 1
          if (item.kind === 'project_file' && /(guide|brand|asset|attachment|file|pdf)/.test(lowerName)) score += 1
          return { item, score }
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      const wantsCsv = /csv|comma[- ]?separated/i.test(content_hints.join(' '))
      resolvedByeTalkAttachments = scored.map(({ item }) => ({
        kind: item.kind,
        id: item.id,
        name: item.name,
        format: item.kind === 'sheet' ? (wantsCsv ? 'csv' : 'xlsx') : undefined,
      }))
    }

    if (resolvedByeTalkAttachments.length > 0) {
      attachmentInfo.push(
        ...resolvedByeTalkAttachments.map((attachment) => attachment.name || `${attachment.kind}-${attachment.id}`)
      )
    }

    // 7. Generate email draft using AI
    const openai = getOpenAI()
    if (!openai) {
      return NextResponse.json(
        { error: 'AI service unavailable' },
        { status: 503 }
      )
    }

    const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'there'

    const prompt = `You are drafting an email for ${userName}, an instructor or representative at Voice Alchemy Academy.

STUDENT / CONTACT INFORMATION:
- Name: ${leadName}
- Email: ${lead.email}

${callTranscript ? `RECENT CALL TRANSCRIPT (reference naturally, don't quote directly):
${callTranscript.substring(0, 2000)}
` : ''}

${emailHistory.length > 0 ? `PREVIOUS EMAIL HISTORY:
${emailHistory.map(e => `- ${e.direction}: "${e.subject}" - ${e.snippet}...`).join('\n')}
` : ''}

WHAT TO INCLUDE IN THIS EMAIL:
${content_hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}

${attachmentInfo.length > 0 ? `DOCUMENTS BEING ATTACHED:
${attachmentInfo.map(f => `- ${f}`).join('\n')}
` : ''}

${commitment_quote ? `ORIGINAL COMMITMENT MADE:
"${commitment_quote}"
` : ''}

TONE: ${tone}

Write a professional email that:
1. Addresses ${leadName} warmly
2. References the recent conversation naturally (if applicable)
3. Delivers on the promise to send the mentioned information/documents
4. Mentions the attached documents if any
5. Has a clear call-to-action (schedule a call, review documents, etc.)
6. Is concise but personable
7. Signs off as ${userName}

Return ONLY a JSON object with:
{
  "subject": "email subject line",
  "body_html": "email body with <p>, <br>, <strong> HTML tags for formatting",
  "body_text": "plain text version of the email"
}

Do NOT include any markdown formatting. Return valid JSON only.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert sales email writer. Write warm, professional emails that build rapport and move deals forward. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    })

    const responseText = response.choices[0]?.message?.content?.trim()
    if (!responseText) {
      return NextResponse.json(
        { error: 'Failed to generate email draft' },
        { status: 500 }
      )
    }

    // Parse response
    let jsonStr = responseText
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim()
    }

    const draftContent = JSON.parse(jsonStr)

    // 8. Save draft to database
    const { data: draft, error: insertError } = await getSupabaseAdmin()
      .from('email_drafts')
      .insert({
        user_id,
        organization_id: orgId,
        lead_id,
        call_id: call_id || null,
        from_account_id: emailAccount?.id || null,
        to_email: lead.email,
        to_name: leadName,
        subject: draftContent.subject,
        body_html: draftContent.body_html,
        body_text: draftContent.body_text,
        attachment_ids: document_ids,
        byetalk_attachment_refs: resolvedByeTalkAttachments,
        due_at: due_at || null,
        status: 'pending',
        ai_generated: true,
        commitment_quote: commitment_quote || null
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error saving draft:', insertError)
      return NextResponse.json(
        { error: 'Failed to save draft' },
        { status: 500 }
      )
    }

    // 9. Return draft details
    return NextResponse.json({
      draft_id: draft.id,
      subject: draftContent.subject,
      body_html: draftContent.body_html,
      body_text: draftContent.body_text,
      attachments: [
        ...attachmentInfo
          .slice(0, document_ids.length)
          .map((name, i) => ({
            id: document_ids[i],
            file_name: name,
          })),
        ...resolvedByeTalkAttachments.map((attachment) => ({
          id: attachment.id,
          file_name: attachment.name || `${attachment.kind}-${attachment.id}`,
          kind: attachment.kind,
          format: attachment.format || null,
        })),
      ],
      byetalk_attachments: resolvedByeTalkAttachments,
      lead_name: leadName,
      lead_email: lead.email,
      due_at
    })

  } catch (error) {
    console.error('Error generating email draft:', error)
    return NextResponse.json(
      { error: 'Failed to generate email draft' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/email/draft?id=<draft_id>
 * Fetch a specific draft
 *
 * GET /api/email/draft?expire=true
 * Run draft expiration cleanup (expires drafts older than 7 days)
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveCaller(request)
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const orgId = caller.organizationId

    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get('id')
    const shouldExpire = searchParams.get('expire') === 'true'

    // If expire=true, run the expiration cleanup (scoped to caller org)
    if (shouldExpire) {
      const result = await expireOldDrafts(orgId)
      return NextResponse.json({
        success: true,
        expiredCount: result.expiredCount,
        message: result.expiredCount > 0
          ? `Expired ${result.expiredCount} old draft(s)`
          : 'No drafts to expire'
      })
    }

    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID required' }, { status: 400 })
    }

    // Run expiration in background when fetching a specific draft
    expireOldDrafts(orgId).catch(err => console.error('[Email Draft API] Background expiration failed:', err))

    const { data: draft, error } = await getSupabaseAdmin()
      .from('email_drafts')
      .select(`
        *,
        lead:leads(id, first_name, last_name, email),
        call:calls(id, transcription, ai_summary)
      `)
      .eq('id', draftId)
      .eq('organization_id', orgId)
      .single()

    if (error || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    // Fetch attachment details
    let attachments: any[] = []
    if (draft.attachment_ids?.length > 0) {
      const { data: docs } = await getSupabaseAdmin()
        .from('documents')
        .select('id, file_name, public_url, mime_type, file_size_bytes')
        .in('id', draft.attachment_ids)
        .eq('organization_id', orgId)

      attachments = docs || []
    }

    if (Array.isArray(draft.byetalk_attachment_refs) && draft.byetalk_attachment_refs.length > 0) {
      const byetalkAttachments = draft.byetalk_attachment_refs
        .map((ref: ByeTalkAttachmentRef) => {
          if (!ref?.id || !ref?.kind) return null
          const format = ref.kind === 'sheet' ? (ref.format === 'csv' ? 'csv' : 'xlsx') : undefined
          const query = new URLSearchParams({
            kind: ref.kind,
            id: ref.id,
          })
          if (format) query.set('format', format)

          const extension =
            ref.kind === 'document'
              ? 'docx'
              : ref.kind === 'presentation'
                ? 'pdf'
                : ref.kind === 'project_file'
                  ? 'bin'
                : format === 'csv'
                  ? 'csv'
                  : 'xlsx'

          return {
            id: ref.id,
            file_name: `${ref.name || `${ref.kind}-${ref.id}`}.${extension}`.replace(/\.+/g, '.'),
            public_url: `/api/email/byetalk-file?${query.toString()}`,
            mime_type:
              ref.kind === 'document'
                ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : ref.kind === 'presentation'
                  ? 'application/pdf'
                  : ref.kind === 'project_file'
                    ? 'application/octet-stream'
                  : format === 'csv'
                    ? 'text/csv'
                    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            file_size_bytes: null,
            byetalk_ref: ref,
          }
        })
        .filter(Boolean)

      attachments = [...attachments, ...byetalkAttachments]
    }

    return NextResponse.json({
      ...draft,
      attachments
    })

  } catch (error) {
    console.error('Error fetching draft:', error)
    return NextResponse.json(
      { error: 'Failed to fetch draft' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/email/draft
 * Update draft status (sent, dismissed)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { draft_id, status } = body

    const caller = await resolveCaller(request)
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const orgId = caller.organizationId

    if (!draft_id || !status) {
      return NextResponse.json(
        { error: 'draft_id and status required' },
        { status: 400 }
      )
    }

    if (!['sent', 'dismissed', 'expired'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      )
    }

    // First, get the draft to check for linked task (constrained to caller org)
    const { data: draft, error: fetchError } = await getSupabaseAdmin()
      .from('email_drafts')
      .select('task_id, to_name')
      .eq('id', draft_id)
      .eq('organization_id', orgId)
      .single()

    console.log('[Email Draft API] Fetched draft for PATCH:', { draft_id, draft, fetchError })

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    const updateData: any = { status }
    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString()
    } else if (status === 'dismissed' || status === 'expired') {
      updateData.dismissed_at = new Date().toISOString()
    }

    const { error } = await getSupabaseAdmin()
      .from('email_drafts')
      .update(updateData)
      .eq('id', draft_id)
      .eq('organization_id', orgId)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update draft' },
        { status: 500 }
      )
    }

    // If draft was sent and has a linked task, mark task as completed
    let taskCompleted = false
    if (status === 'sent' && draft?.task_id) {
      const { error: taskError } = await getSupabaseAdmin()
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', draft.task_id)
        .eq('organization_id', orgId)

      if (!taskError) {
        taskCompleted = true
        console.log('[Email Draft API] Linked task marked as complete:', draft.task_id)
      } else {
        console.error('[Email Draft API] Failed to complete linked task:', taskError)
      }
    }

    return NextResponse.json({
      success: true,
      taskCompleted,
      taskId: draft?.task_id || null,
      recipientName: draft?.to_name || null
    })

  } catch (error) {
    console.error('Error updating draft:', error)
    return NextResponse.json(
      { error: 'Failed to update draft' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/email/draft?id=<draft_id>
 * Permanently delete a draft and optionally its linked task
 */
export async function DELETE(request: NextRequest) {
  try {
    const caller = await resolveCaller(request)
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const orgId = caller.organizationId

    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get('id')
    const deleteTask = searchParams.get('deleteTask') === 'true'

    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID required' }, { status: 400 })
    }

    // Get the draft first to check for linked task (constrained to caller org)
    const { data: draft } = await getSupabaseAdmin()
      .from('email_drafts')
      .select('task_id')
      .eq('id', draftId)
      .eq('organization_id', orgId)
      .single()

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    // Delete the draft
    const { error: deleteError } = await getSupabaseAdmin()
      .from('email_drafts')
      .delete()
      .eq('id', draftId)
      .eq('organization_id', orgId)

    if (deleteError) {
      console.error('Error deleting draft:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete draft' },
        { status: 500 }
      )
    }

    // If requested and there's a linked task, delete it too
    let taskDeleted = false
    if (deleteTask && draft?.task_id) {
      const { error: taskError } = await getSupabaseAdmin()
        .from('tasks')
        .delete()
        .eq('id', draft.task_id)
        .eq('organization_id', orgId)

      if (!taskError) {
        taskDeleted = true
        console.log('[Email Draft API] Linked task deleted:', draft.task_id)
      } else {
        console.error('[Email Draft API] Failed to delete linked task:', taskError)
      }
    }

    return NextResponse.json({
      success: true,
      taskDeleted,
      deletedTaskId: draft?.task_id || null
    })

  } catch (error) {
    console.error('Error deleting draft:', error)
    return NextResponse.json(
      { error: 'Failed to delete draft' },
      { status: 500 }
    )
  }
}
