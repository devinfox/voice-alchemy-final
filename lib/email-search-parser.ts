/**
 * Email Search Parser
 *
 * Parses Gmail-style search operators from a query string.
 *
 * Supported operators:
 * - is:unread, is:starred, is:read
 * - has:attachment
 * - in:inbox, in:sent, in:archive, in:trash, in:spam, in:drafts
 * - from:email
 * - to:email
 * - before:YYYY-MM-DD, after:YYYY-MM-DD
 * - label:name
 * - subject:text
 * - body:text
 */

export interface ParsedEmailSearch {
  // Free text query (everything not an operator)
  query: string

  // Filters
  isUnread?: boolean
  isStarred?: boolean
  isRead?: boolean
  hasAttachment?: boolean
  folder?: 'inbox' | 'sent' | 'archive' | 'trash' | 'spam' | 'drafts'
  from?: string
  to?: string
  beforeDate?: string // ISO date string
  afterDate?: string // ISO date string
  label?: string
  subject?: string
  body?: string
  workflowState?: 'needs_response' | 'waiting_on_reply' | 'snoozed' | 'done'
}

const OPERATOR_PATTERNS = [
  { regex: /\bis:unread\b/gi, handler: (result: ParsedEmailSearch) => { result.isUnread = true } },
  { regex: /\bis:starred\b/gi, handler: (result: ParsedEmailSearch) => { result.isStarred = true } },
  { regex: /\bis:read\b/gi, handler: (result: ParsedEmailSearch) => { result.isRead = true } },
  { regex: /\bhas:attachment\b/gi, handler: (result: ParsedEmailSearch) => { result.hasAttachment = true } },
  { regex: /\bis:needs_response\b/gi, handler: (result: ParsedEmailSearch) => { result.workflowState = 'needs_response' } },
  { regex: /\bis:waiting\b/gi, handler: (result: ParsedEmailSearch) => { result.workflowState = 'waiting_on_reply' } },
  { regex: /\bis:snoozed\b/gi, handler: (result: ParsedEmailSearch) => { result.workflowState = 'snoozed' } },
  { regex: /\bis:done\b/gi, handler: (result: ParsedEmailSearch) => { result.workflowState = 'done' } },
  {
    regex: /\bin:(inbox|sent|archive|trash|spam|drafts)\b/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const folder = match.replace(/^in:/i, '').toLowerCase() as ParsedEmailSearch['folder']
      result.folder = folder
    }
  },
  {
    regex: /\bfrom:("[^"]+"|[^\s]+)/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const value = match.replace(/^from:/i, '').replace(/^"|"$/g, '')
      result.from = value
    }
  },
  {
    regex: /\bto:("[^"]+"|[^\s]+)/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const value = match.replace(/^to:/i, '').replace(/^"|"$/g, '')
      result.to = value
    }
  },
  {
    regex: /\bbefore:(\d{4}-\d{2}-\d{2})/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const date = match.replace(/^before:/i, '')
      result.beforeDate = date
    }
  },
  {
    regex: /\bafter:(\d{4}-\d{2}-\d{2})/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const date = match.replace(/^after:/i, '')
      result.afterDate = date
    }
  },
  {
    regex: /\blabel:("[^"]+"|[^\s]+)/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const value = match.replace(/^label:/i, '').replace(/^"|"$/g, '')
      result.label = value
    }
  },
  {
    regex: /\bsubject:("[^"]+"|[^\s]+)/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const value = match.replace(/^subject:/i, '').replace(/^"|"$/g, '')
      result.subject = value
    }
  },
  {
    regex: /\bbody:("[^"]+"|[^\s]+)/gi,
    handler: (result: ParsedEmailSearch, match: string) => {
      const value = match.replace(/^body:/i, '').replace(/^"|"$/g, '')
      result.body = value
    }
  },
]

export function parseEmailSearch(input: string): ParsedEmailSearch {
  const result: ParsedEmailSearch = {
    query: input,
  }

  let queryText = input

  // Process each operator pattern
  for (const { regex, handler } of OPERATOR_PATTERNS) {
    const matches = queryText.match(regex)
    if (matches) {
      for (const match of matches) {
        handler(result, match)
        // Remove matched operator from query text
        queryText = queryText.replace(match, '')
      }
    }
  }

  // Clean up remaining query text
  result.query = queryText.replace(/\s+/g, ' ').trim()

  return result
}

/**
 * Build a PostgreSQL full-text search query from the parsed search
 */
export function buildTsQuery(parsed: ParsedEmailSearch): string | null {
  const parts: string[] = []

  // Add the main query text
  if (parsed.query) {
    // Split into words and join with &
    const words = parsed.query
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => {
        // Escape special characters and add prefix matching
        const escaped = w.replace(/[&|!():'\\]/g, '')
        return escaped ? `${escaped}:*` : null
      })
      .filter(Boolean)

    if (words.length > 0) {
      parts.push(words.join(' & '))
    }
  }

  // Add subject search if specified
  if (parsed.subject) {
    const words = parsed.subject
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => w.replace(/[&|!():'\\]/g, ''))
      .filter(Boolean)
      .map(w => `${w}:*`)

    if (words.length > 0) {
      parts.push(words.join(' & '))
    }
  }

  // Add body search if specified
  if (parsed.body) {
    const words = parsed.body
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => w.replace(/[&|!():'\\]/g, ''))
      .filter(Boolean)
      .map(w => `${w}:*`)

    if (words.length > 0) {
      parts.push(words.join(' & '))
    }
  }

  if (parts.length === 0) {
    return null
  }

  return parts.join(' & ')
}

/**
 * Get search suggestions based on input
 */
export function getSearchSuggestions(input: string): string[] {
  const suggestions: string[] = []
  const lowerInput = input.toLowerCase()

  const operators = [
    { prefix: 'is:', options: ['is:unread', 'is:read', 'is:starred', 'is:needs_response', 'is:waiting', 'is:snoozed', 'is:done'] },
    { prefix: 'has:', options: ['has:attachment'] },
    { prefix: 'in:', options: ['in:inbox', 'in:sent', 'in:archive', 'in:trash', 'in:spam', 'in:drafts'] },
    { prefix: 'from:', options: ['from:'] },
    { prefix: 'to:', options: ['to:'] },
    { prefix: 'subject:', options: ['subject:'] },
    { prefix: 'body:', options: ['body:'] },
    { prefix: 'label:', options: ['label:'] },
    { prefix: 'before:', options: ['before:YYYY-MM-DD'] },
    { prefix: 'after:', options: ['after:YYYY-MM-DD'] },
  ]

  // Get the last word/partial word
  const lastWord = lowerInput.split(/\s+/).pop() || ''

  for (const { prefix, options } of operators) {
    if (prefix.startsWith(lastWord) || lastWord.startsWith(prefix)) {
      suggestions.push(...options.filter(o => o.startsWith(lastWord)))
    }
  }

  return suggestions.slice(0, 5)
}
