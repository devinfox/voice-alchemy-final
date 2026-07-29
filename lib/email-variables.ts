/**
 * Email Template Variables
 * These variables can be inserted into email templates and will be
 * replaced with actual values when sending emails.
 */

export interface EmailVariable {
  key: string;
  label: string;
  description?: string;
}

export interface EmailVariableGroup {
  name: string;
  variables: EmailVariable[];
}

export const EMAIL_VARIABLES: EmailVariableGroup[] = [
  {
    name: 'Lead',
    variables: [
      { key: '{{lead_first_name}}', label: 'First Name', description: 'Lead\'s first name' },
      { key: '{{lead_last_name}}', label: 'Last Name', description: 'Lead\'s last name' },
      { key: '{{lead_full_name}}', label: 'Full Name', description: 'Lead\'s full name' },
      { key: '{{lead_email}}', label: 'Email', description: 'Lead\'s email address' },
      { key: '{{lead_phone}}', label: 'Phone', description: 'Lead\'s phone number' },
    ],
  },
  {
    name: 'Contact',
    variables: [
      { key: '{{contact_first_name}}', label: 'First Name', description: 'Contact\'s first name' },
      { key: '{{contact_last_name}}', label: 'Last Name', description: 'Contact\'s last name' },
      { key: '{{contact_full_name}}', label: 'Full Name', description: 'Contact\'s full name' },
      { key: '{{contact_email}}', label: 'Email', description: 'Contact\'s email address' },
      { key: '{{contact_phone}}', label: 'Phone', description: 'Contact\'s phone number' },
    ],
  },
  {
    name: 'Deal',
    variables: [
      { key: '{{deal_name}}', label: 'Deal Name', description: 'Name of the deal' },
      { key: '{{deal_amount}}', label: 'Amount', description: 'Deal amount (formatted)' },
      { key: '{{deal_stage}}', label: 'Stage', description: 'Current deal stage' },
      { key: '{{deal_type}}', label: 'Type', description: 'Type of deal (IRA, Rollover, etc.)' },
    ],
  },
  {
    name: 'Rep',
    variables: [
      { key: '{{rep_first_name}}', label: 'First Name', description: 'Sales rep\'s first name' },
      { key: '{{rep_last_name}}', label: 'Last Name', description: 'Sales rep\'s last name' },
      { key: '{{rep_full_name}}', label: 'Full Name', description: 'Sales rep\'s full name' },
      { key: '{{rep_email}}', label: 'Email', description: 'Sales rep\'s email address' },
      { key: '{{rep_phone}}', label: 'Phone', description: 'Sales rep\'s phone number' },
    ],
  },
];

// Flat list of all variables for easy lookup
export const ALL_VARIABLES = EMAIL_VARIABLES.flatMap(group => group.variables);

// Get all variable keys for validation
export const VARIABLE_KEYS = ALL_VARIABLES.map(v => v.key);

/**
 * Replace variables in a template string with actual values
 */
export function replaceVariables(
  template: string,
  values: Record<string, string | number | null | undefined>
): string {
  let result = template;

  for (const [key, value] of Object.entries(values)) {
    const variableKey = `{{${key}}}`;
    result = result.replace(new RegExp(variableKey.replace(/[{}]/g, '\\$&'), 'g'), String(value ?? ''));
  }

  return result;
}

/**
 * Build values object from lead, contact, deal, and rep data
 */
export function buildVariableValues(data: {
  lead?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  contact?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  deal?: {
    name?: string | null;
    estimated_value?: number | null;
    stage?: string | null;
    deal_type?: string | null;
  } | null;
  rep?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}): Record<string, string> {
  const values: Record<string, string> = {};

  // Lead variables
  if (data.lead) {
    values['lead_first_name'] = data.lead.first_name || '';
    values['lead_last_name'] = data.lead.last_name || '';
    values['lead_full_name'] = [data.lead.first_name, data.lead.last_name].filter(Boolean).join(' ');
    values['lead_email'] = data.lead.email || '';
    values['lead_phone'] = data.lead.phone || '';
  }

  // Contact variables
  if (data.contact) {
    values['contact_first_name'] = data.contact.first_name || '';
    values['contact_last_name'] = data.contact.last_name || '';
    values['contact_full_name'] = [data.contact.first_name, data.contact.last_name].filter(Boolean).join(' ');
    values['contact_email'] = data.contact.email || '';
    values['contact_phone'] = data.contact.phone || '';
  }

  // Deal variables
  if (data.deal) {
    values['deal_name'] = data.deal.name || '';
    values['deal_amount'] = data.deal.estimated_value
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.deal.estimated_value)
      : '';
    values['deal_stage'] = formatDealStage(data.deal.stage || '');
    values['deal_type'] = formatDealType(data.deal.deal_type || '');
  }

  // Rep variables
  if (data.rep) {
    values['rep_first_name'] = data.rep.first_name || '';
    values['rep_last_name'] = data.rep.last_name || '';
    values['rep_full_name'] = [data.rep.first_name, data.rep.last_name].filter(Boolean).join(' ');
    values['rep_email'] = data.rep.email || '';
    values['rep_phone'] = data.rep.phone || '';
  }

  return values;
}

/**
 * Format deal stage for display
 */
function formatDealStage(stage: string): string {
  const stageMap: Record<string, string> = {
    'deal_opened': 'Deal Opened',
    'proposal_education': 'Proposal/Education',
    'paperwork_sent': 'Paperwork Sent',
    'paperwork_complete': 'Paperwork Complete',
    'funding_in_progress': 'Funding In Progress',
    'closed_won': 'Closed Won',
    'closed_lost': 'Closed Lost',
  };
  return stageMap[stage] || stage;
}

/**
 * Format deal type for display
 */
function formatDealType(dealType: string): string {
  const typeMap: Record<string, string> = {
    'new_ira': 'New IRA',
    'ira_rollover': 'IRA Rollover',
    'ira_transfer': 'IRA Transfer',
    'cash_purchase': 'Cash Purchase',
    'additional_investment': 'Additional Investment',
    'liquidation': 'Liquidation',
  };
  return typeMap[dealType] || dealType;
}

/**
 * Sample values for template preview
 */
export const SAMPLE_VALUES: Record<string, string> = {
  lead_first_name: 'John',
  lead_last_name: 'Smith',
  lead_full_name: 'John Smith',
  lead_email: 'john.smith@example.com',
  lead_phone: '(555) 123-4567',
  contact_first_name: 'John',
  contact_last_name: 'Smith',
  contact_full_name: 'John Smith',
  contact_email: 'john.smith@example.com',
  contact_phone: '(555) 123-4567',
  deal_name: 'Gold IRA Rollover',
  deal_amount: '$50,000.00',
  deal_stage: 'Paperwork Sent',
  deal_type: 'IRA Rollover',
  rep_first_name: 'Sarah',
  rep_last_name: 'Johnson',
  rep_full_name: 'Sarah Johnson',
  rep_email: 'sarah.johnson@citadelgold.com',
  rep_phone: '(800) 555-0199',
};

/**
 * Template categories with labels
 */
export const TEMPLATE_CATEGORIES = [
  { value: 'welcome', label: 'Welcome' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'paperwork', label: 'Paperwork' },
  { value: 'funding', label: 'Funding' },
  { value: 'closing', label: 'Closing' },
  { value: 'general', label: 'General' },
] as const;
