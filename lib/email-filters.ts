/**
 * Email Filtering Utilities
 *
 * Filters out spam, promotional, marketing, and non-work-related emails
 * to prevent AI analysis from creating irrelevant tasks.
 */

// Domains that are known promotional/marketing senders
const BLOCKED_DOMAINS = new Set([
  // Retail & E-commerce
  'macys.com', 'nordstrom.com', 'amazon.com', 'ebay.com', 'walmart.com',
  'target.com', 'bestbuy.com', 'costco.com', 'kohls.com', 'jcpenney.com',
  'gap.com', 'oldnavy.com', 'bananarepublic.com', 'zara.com', 'hm.com',
  'nike.com', 'adidas.com', 'underarmour.com', 'footlocker.com',
  'sephora.com', 'ulta.com', 'bathandbodyworks.com',
  'homedepot.com', 'lowes.com', 'wayfair.com', 'overstock.com',
  'etsy.com', 'wish.com', 'aliexpress.com', 'shein.com',

  // Food & Restaurants
  'doordash.com', 'ubereats.com', 'grubhub.com', 'postmates.com',
  'dominos.com', 'pizzahut.com', 'papajohns.com',
  'starbucks.com', 'dunkindonuts.com', 'chipotle.com', 'mcdonalds.com',

  // Travel & Hotels
  'expedia.com', 'booking.com', 'hotels.com', 'airbnb.com', 'vrbo.com',
  'kayak.com', 'priceline.com', 'tripadvisor.com',
  'southwest.com', 'united.com', 'delta.com', 'aa.com', 'jetblue.com',
  'hilton.com', 'marriott.com', 'hyatt.com', 'ihg.com',

  // Financial Marketing
  'creditkarma.com', 'nerdwallet.com', 'mint.com', 'personalcapital.com',
  'sofi.com', 'marcus.com', 'discover.com', 'capitalone.com',

  // Entertainment & Media
  'netflix.com', 'hulu.com', 'spotify.com', 'apple.com', 'disneyplus.com',
  'hbomax.com', 'paramountplus.com', 'peacocktv.com',
  'ticketmaster.com', 'stubhub.com', 'livenation.com',

  // Marketing Platforms & Newsletters
  'mailchimp.com', 'constantcontact.com', 'hubspot.com', 'marketo.com',
  'sendgrid.net', 'mailgun.com', 'substack.com', 'beehiiv.com',
  'medium.com', 'linkedin.com', 'quora.com',
  'createsend.com', 'cmail19.com', 'cmail20.com',
  'em.fitbit.com', 'e.groupon.com', 'e.livingsocial.com',

  // PR & News Services
  'helpareporter.com', 'haro.com', 'prnewswire.com', 'businesswire.com',
  'cision.com', 'muckrack.com', 'prweb.com',

  // Social Media Notifications
  'facebookmail.com', 'twitter.com', 'instagram.com', 'tiktok.com',
  'pinterest.com', 'snapchat.com', 'youtube.com',

  // Job Boards (notifications, not direct recruiter emails)
  'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'monster.com',

  // Coupons & Deals
  'groupon.com', 'retailmenot.com', 'slickdeals.net', 'coupons.com',
  'rakuten.com', 'honey.com',

  // Surveys & Feedback
  'surveymonkey.com', 'typeform.com', 'qualtrics.com',

  // No-reply addresses (system notifications)
  'noreply.com', 'no-reply.com', 'notifications.com',
])

// Email address patterns that indicate automated/marketing emails
const BLOCKED_EMAIL_PATTERNS = [
  /^(no-?reply|noreply|do-?not-?reply|donotreply)@/i,
  /^(news|newsletter|marketing|promo|promotions|offers|deals|sales|info|support|notifications?|alerts?)@/i,
  /^(updates?|announcements?|mailer|mail|bounce|auto|automated)@/i,
  /^(unsubscribe|subscribe|confirm|verification|verify)@/i,
  /^(feedback|survey|nps|customerservice|cs|help)@/i,
  /cmail\d+\.com$/i,
  /\.campaign\./i,
  /\.mkt\./i,
  /sendgrid\.net$/i,
  /mailgun\.(org|com)$/i,
  /amazonses\.com$/i,
  /mandrillapp\.com$/i,
]

// Subject patterns that indicate promotional/marketing content
const BLOCKED_SUBJECT_PATTERNS = [
  // Unsubscribe indicators
  /unsubscribe/i,
  /opt[- ]?out/i,
  /manage\s*(your\s*)?(preferences|subscription)/i,

  // Promotional language
  /\b(sale|discount|off|coupon|promo|deal|offer|save|free|clearance|limited\s*time)\b/i,
  /\b(\d+%\s*off|\$\d+\s*off|buy\s*one|bogo)\b/i,
  /\b(flash\s*sale|black\s*friday|cyber\s*monday|holiday\s*sale)\b/i,

  // Newsletter indicators
  /\b(newsletter|weekly\s*digest|daily\s*digest|monthly\s*update|roundup)\b/i,
  /\b(this\s*week\s*in|top\s*stories|trending)\b/i,

  // Marketing automation
  /\b(we\s*miss\s*you|come\s*back|haven'?t\s*seen\s*you|it'?s\s*been\s*a\s*while)\b/i,
  /\b(just\s*for\s*you|exclusive|vip|member\s*only|early\s*access)\b/i,
  /\b(don'?t\s*miss|last\s*chance|ending\s*soon|expires|hurry)\b/i,

  // Shipping/order notifications (not action-required)
  /\b(your\s*order\s*(has\s*)?shipped|tracking\s*number|delivery\s*update)\b/i,
  /\b(order\s*confirmation|receipt|invoice)\s*(#|number|:)/i,

  // Account notifications
  /\b(password\s*(reset|changed)|security\s*alert|login\s*attempt)\b/i,
  /\b(verify\s*your\s*(email|account)|confirm\s*your)\b/i,
  /\b(welcome\s*to|thanks?\s*for\s*(signing|joining|subscribing))\b/i,

  // Social notifications
  /\b(new\s*follower|someone\s*followed|liked\s*your|commented\s*on)\b/i,
  /\b(you\s*have\s*\d+\s*new\s*(notification|message|connection))/i,

  // Survey/feedback
  /\b(how\s*(was|did)|rate\s*your|feedback|survey|review\s*your\s*experience)\b/i,
  /\b(tell\s*us\s*(what|how)|share\s*your\s*(thoughts|opinion))\b/i,
]

// Content patterns that indicate non-work-related emails
const BLOCKED_CONTENT_PATTERNS = [
  // Unsubscribe footers (strong indicator of marketing)
  /unsubscribe|opt[- ]?out|manage\s*preferences/i,
  /you('re|\s+are)\s+receiving\s+this\s+(email|because)/i,
  /sent\s+to\s+you\s+by|this\s+email\s+was\s+sent\s+to/i,
  /view\s+(this\s+)?email\s+in\s+(your\s+)?browser/i,
  /add\s+us\s+to\s+your\s+(address|contact)\s*book/i,
  /update\s+your\s+email\s+preferences/i,

  // Physical address footers (CAN-SPAM requirement for marketing)
  /\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln)/i,

  // Marketing boilerplate
  /©\s*\d{4}.*all\s+rights\s+reserved/i,
  /privacy\s+policy.*terms\s+(of\s+)?(service|use)/i,
]

// Patterns that indicate work-related/legitimate business emails
const WORK_RELATED_PATTERNS = [
  // Project/work related
  /\b(project|proposal|quote|estimate|invoice|contract|agreement|scope)\b/i,
  /\b(meeting|call|schedule|availability|calendar)\b/i,
  /\b(deadline|deliverable|milestone|timeline|budget)\b/i,
  /\b(follow[- ]?up|following\s*up|checking\s*in|touching\s*base)\b/i,

  // Business inquiries
  /\b(interested\s*in|inquiry|enquiry|request\s*for|rfp|rfq)\b/i,
  /\b(services?|solution|consultation|help\s*with)\b/i,
  /\b(pricing|cost|rate|fee|payment)\b/i,

  // Collaboration
  /\b(draft|review|feedback|thoughts|input|comments?)\b/i,
  /\b(attached|attachment|document|file|pdf|deck)\b/i,
  /\b(update|status|progress|report)\b/i,

  // Questions/requests
  /\b(question|wondering|could\s*you|can\s*you|would\s*you)\b/i,
  /\b(need|require|looking\s*for|seeking)\b/i,
]

export interface EmailFilterResult {
  shouldProcess: boolean
  reason?: string
  category?: 'spam' | 'promotional' | 'automated' | 'notification' | 'non_work'
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  const match = email.match(/@([^@]+)$/)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Check if an email should be processed for AI analysis
 */
export function shouldProcessEmailForAI(
  fromAddress: string,
  subject: string | null,
  bodyText: string | null,
  isInbound: boolean
): EmailFilterResult {
  // Always process outbound emails (our own sent emails)
  if (!isInbound) {
    return { shouldProcess: true }
  }

  const fromLower = fromAddress.toLowerCase()
  const domain = extractDomain(fromAddress)
  const subjectLower = (subject || '').toLowerCase()
  const bodyLower = (bodyText || '').toLowerCase().slice(0, 5000) // Only check first 5000 chars

  // 1. Check blocked domains
  if (BLOCKED_DOMAINS.has(domain)) {
    return {
      shouldProcess: false,
      reason: `Blocked domain: ${domain}`,
      category: 'promotional',
    }
  }

  // Also check parent domain (e.g., mail.company.com -> company.com)
  const parentDomain = domain.split('.').slice(-2).join('.')
  if (parentDomain !== domain && BLOCKED_DOMAINS.has(parentDomain)) {
    return {
      shouldProcess: false,
      reason: `Blocked parent domain: ${parentDomain}`,
      category: 'promotional',
    }
  }

  // 2. Check blocked email patterns
  for (const pattern of BLOCKED_EMAIL_PATTERNS) {
    if (pattern.test(fromLower)) {
      return {
        shouldProcess: false,
        reason: `Blocked email pattern: ${fromLower}`,
        category: 'automated',
      }
    }
  }

  // 3. Check blocked subject patterns
  for (const pattern of BLOCKED_SUBJECT_PATTERNS) {
    if (pattern.test(subjectLower)) {
      return {
        shouldProcess: false,
        reason: `Blocked subject pattern: "${subject?.slice(0, 50)}"`,
        category: 'promotional',
      }
    }
  }

  // 4. Check content for marketing indicators
  let marketingIndicators = 0
  for (const pattern of BLOCKED_CONTENT_PATTERNS) {
    if (pattern.test(bodyLower)) {
      marketingIndicators++
    }
  }

  // If 2+ marketing indicators, likely promotional
  if (marketingIndicators >= 2) {
    return {
      shouldProcess: false,
      reason: `Multiple marketing indicators in content (${marketingIndicators})`,
      category: 'promotional',
    }
  }

  // 5. Check for work-related content (positive signal)
  let workRelatedScore = 0
  for (const pattern of WORK_RELATED_PATTERNS) {
    if (pattern.test(subjectLower) || pattern.test(bodyLower)) {
      workRelatedScore++
    }
  }

  // If no work-related signals AND has marketing indicators, skip
  if (workRelatedScore === 0 && marketingIndicators > 0) {
    return {
      shouldProcess: false,
      reason: 'No work-related content detected, has marketing indicators',
      category: 'non_work',
    }
  }

  // Default: process the email
  return { shouldProcess: true }
}

/**
 * Quick check if email is from a known lead or contact
 * This bypasses other filters - if they're in our CRM, we want to process their emails
 */
export function isKnownCRMContact(leadId: string | null, contactId: string | null): boolean {
  return !!(leadId || contactId)
}

// ============================================================================
// AI KNOWLEDGE TRAINING FILTERS
// Stricter filtering for what emails can train the organization's AI
// ============================================================================

export interface KnowledgeTrainingFilterResult {
  shouldTrain: boolean
  reason?: string
  category?: 'allowed' | 'marketing' | 'automated' | 'system' | 'unknown_sender' | 'low_value'
}

// Additional patterns to exclude from AI training (beyond normal email filtering)
const TRAINING_EXCLUDED_SUBJECT_PATTERNS = [
  // Transactional/receipt emails - not valuable for training
  /\b(receipt|order\s*#|confirmation\s*#|invoice\s*#|payment\s*received)\b/i,
  /\b(shipped|delivered|tracking|out\s*for\s*delivery)\b/i,

  // System notifications
  /\b(password|reset|verify|confirm\s*your\s*email|activate\s*your)\b/i,
  /\b(security\s*alert|login\s*from|new\s*device|suspicious\s*activity)\b/i,

  // Welcome/onboarding (not learning material)
  /\b(welcome\s*to|getting\s*started|quick\s*start|thank\s*you\s*for\s*(signing|joining|registering))\b/i,

  // Calendar/scheduling automation
  /\b(meeting\s*(accepted|declined|canceled|invitation)|calendar\s*invite)\b/i,
  /\b(reminder:|event\s*reminder|upcoming\s*meeting)\b/i,

  // Auto-responses
  /\b(out\s*of\s*(the\s*)?office|automatic\s*reply|auto-?reply|away\s*message)\b/i,
  /\b(on\s*vacation|currently\s*unavailable|limited\s*access\s*to\s*email)\b/i,

  // Subscriptions & newsletters (even from vendors)
  /\b(weekly\s*update|monthly\s*digest|your\s*\w+\s*summary|this\s*month\s*in)\b/i,
  /\b(product\s*update|what'?s\s*new|feature\s*announcement|release\s*notes)\b/i,

  // Mass communications
  /\b(dear\s*(valued\s*)?(customer|client|member|subscriber))/i,
  /\b(important\s*notice|policy\s*update|terms\s*(of\s*)?(service|use)\s*update)\b/i,
]

// Patterns that indicate high-value training material
const TRAINING_VALUABLE_PATTERNS = [
  // Direct conversation with clients/leads
  /\b(hi\s+[A-Z][a-z]+|hello\s+[A-Z][a-z]+|dear\s+[A-Z][a-z]+)\b/,
  /\b(thanks?\s*for\s*(your|the)\s*(call|meeting|time|email))\b/i,

  // Business discussions
  /\b(proposal|quote|estimate|pricing|scope\s*of\s*work)\b/i,
  /\b(contract|agreement|terms|negotiate|discuss)\b/i,
  /\b(project|deliverable|milestone|timeline|deadline)\b/i,

  // Sales/customer success interactions
  /\b(follow\s*up|following\s*up|wanted\s*to\s*check|circling\s*back)\b/i,
  /\b(how\s*(can|may)\s*(we|I)\s*help|let\s*me\s*know\s*if)\b/i,
  /\b(question|concern|issue|problem|help\s*with)\b/i,

  // Relationship building
  /\b(great\s*(meeting|speaking|talking)|enjoyed\s*(our|the)\s*(call|conversation))\b/i,
  /\b(look\s*forward\s*to|excited\s*(to|about)|happy\s*to\s*help)\b/i,

  // Decision making
  /\b(decision|approve|approved|go\s*ahead|green\s*light|move\s*forward)\b/i,
  /\b(interested|not\s*interested|considering|thinking\s*about)\b/i,
  /\b(budget|cost|investment|roi|value)\b/i,
]

/**
 * Determine if an email should be used for AI knowledge training
 *
 * This is STRICTER than shouldProcessEmailForAI because we only want to train on:
 * 1. Direct communications with known leads/contacts
 * 2. Internal team emails (same organization domain)
 * 3. High-value business discussions
 *
 * We exclude:
 * - Marketing/promotional emails
 * - Automated notifications
 * - System emails (password resets, receipts, etc.)
 * - Mass communications
 * - Unknown senders with no CRM association
 */
export function shouldUseEmailForKnowledgeTraining(
  fromAddress: string,
  toAddresses: string[],
  subject: string | null,
  bodyText: string | null,
  isInbound: boolean,
  options: {
    leadId?: string | null
    contactId?: string | null
    organizationDomain?: string | null
    senderOrganizationId?: string | null
    recipientOrganizationId?: string | null
  } = {}
): KnowledgeTrainingFilterResult {
  const fromLower = fromAddress.toLowerCase()
  const fromDomain = extractDomain(fromAddress)
  const subjectLower = (subject || '').toLowerCase()
  const bodyLower = (bodyText || '').toLowerCase().slice(0, 5000)

  // 1. First, apply all the standard email filters
  const baseFilter = shouldProcessEmailForAI(fromAddress, subject, bodyText, isInbound)
  if (!baseFilter.shouldProcess) {
    return {
      shouldTrain: false,
      reason: baseFilter.reason,
      category: 'marketing',
    }
  }

  // 2. Check if from a known lead or contact - this is ALWAYS valuable
  if (options.leadId || options.contactId) {
    // Still check for training-excluded patterns even for known contacts
    // (e.g., their auto-replies shouldn't train the AI)
    for (const pattern of TRAINING_EXCLUDED_SUBJECT_PATTERNS) {
      if (pattern.test(subjectLower)) {
        return {
          shouldTrain: false,
          reason: `System/automated email from known contact: ${subject?.slice(0, 40)}`,
          category: 'system',
        }
      }
    }
    return {
      shouldTrain: true,
      category: 'allowed',
    }
  }

  // 3. Check if internal email (same organization domain)
  if (options.organizationDomain) {
    const orgDomain = options.organizationDomain.toLowerCase()
    const isFromInternal = fromDomain === orgDomain
    const isToInternal = toAddresses.some(addr =>
      extractDomain(addr).toLowerCase() === orgDomain
    )

    if (isFromInternal || isToInternal) {
      // Internal emails are generally valuable, but skip system notifications
      for (const pattern of TRAINING_EXCLUDED_SUBJECT_PATTERNS) {
        if (pattern.test(subjectLower)) {
          return {
            shouldTrain: false,
            reason: `Internal system email: ${subject?.slice(0, 40)}`,
            category: 'system',
          }
        }
      }
      return {
        shouldTrain: true,
        reason: 'Internal organization email',
        category: 'allowed',
      }
    }
  }

  // 4. Check for training-excluded patterns
  for (const pattern of TRAINING_EXCLUDED_SUBJECT_PATTERNS) {
    if (pattern.test(subjectLower)) {
      return {
        shouldTrain: false,
        reason: `Excluded subject pattern: ${subject?.slice(0, 40)}`,
        category: 'automated',
      }
    }
  }

  // 5. Score the email for training value
  let valueScore = 0
  for (const pattern of TRAINING_VALUABLE_PATTERNS) {
    if (pattern.test(subjectLower) || pattern.test(bodyLower)) {
      valueScore++
    }
  }

  // 6. Check for marketing indicators in content
  let marketingScore = 0
  for (const pattern of BLOCKED_CONTENT_PATTERNS) {
    if (pattern.test(bodyLower)) {
      marketingScore++
    }
  }

  // 7. Decision logic
  if (valueScore >= 2) {
    // High-value content - train on it
    return {
      shouldTrain: true,
      reason: `High-value content (score: ${valueScore})`,
      category: 'allowed',
    }
  }

  if (valueScore >= 1 && marketingScore === 0) {
    // Some value, no marketing indicators
    return {
      shouldTrain: true,
      reason: `Valuable content with no marketing indicators`,
      category: 'allowed',
    }
  }

  if (marketingScore >= 1) {
    // Has marketing indicators, skip
    return {
      shouldTrain: false,
      reason: `Marketing indicators detected (${marketingScore})`,
      category: 'marketing',
    }
  }

  // 8. Unknown sender with no value signals - skip to be safe
  return {
    shouldTrain: false,
    reason: 'Unknown sender with no clear business value',
    category: 'unknown_sender',
  }
}
