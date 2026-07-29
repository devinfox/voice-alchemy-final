import { EmailBlock, EmailSettings, defaultEmailSettings } from '@/lib/email-builder-context'
import { ensureReadableColor, ensureVisibleDivider, isLightColor } from './color-utils'

// Generate dark mode CSS for email clients that support it
function generateDarkModeCSS(settings: EmailSettings): string {
  const isLight = isLightColor(settings.contentBackgroundColor)

  // If user designed in dark mode, provide light mode alternative and vice versa
  if (isLight) {
    // User designed in light mode - provide dark mode styles
    return `
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: #1a1a1a !important; }
      .email-container { background-color: #2d2d2d !important; }
      .email-text { color: #f5f5f5 !important; }
      .email-text-muted { color: #cccccc !important; }
      .email-divider { border-color: #404040 !important; }
    }
    `
  } else {
    // User designed in dark mode - provide light mode styles
    return `
    @media (prefers-color-scheme: light) {
      .email-body { background-color: #f5f5f5 !important; }
      .email-container { background-color: #ffffff !important; }
      .email-text { color: #333333 !important; }
      .email-text-muted { color: #666666 !important; }
      .email-divider { border-color: #e0e0e0 !important; }
    }
    `
  }
}

// Convert blocks to email-safe HTML with inline styles
export function blocksToHtml(blocks: EmailBlock[], settings?: EmailSettings): string {
  const emailSettings = settings || defaultEmailSettings
  const contentBg = emailSettings.contentBackgroundColor
  const bodyContent = blocks.map(block => blockToHtml(block, contentBg)).join('')
  const darkModeCSS = generateDarkModeCSS(emailSettings)

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Email</title>
  <style>
    /* Dark mode support for email clients */
    :root { color-scheme: light dark; }
    ${darkModeCSS}
  </style>
  <!--[if mso]>
  <style type="text/css">
    .email-text { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body class="email-body" style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: ${emailSettings.backgroundColor};">
  <table role="presentation" cellpadding="0" cellspacing="0" class="email-body" style="width: 100%; background-color: ${emailSettings.backgroundColor};">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" class="email-container" style="width: 100%; max-width: 600px; background-color: ${emailSettings.contentBackgroundColor};">
          ${bodyContent}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim()
}

// Convert a single block to HTML
function blockToHtml(block: EmailBlock, contentBg: string): string {
  const { type, properties } = block

  switch (type) {
    case 'text':
      return textBlockToHtml(properties, contentBg)
    case 'image':
      return imageBlockToHtml(properties)
    case 'button':
      return buttonBlockToHtml(properties, contentBg)
    case 'divider':
      return dividerBlockToHtml(properties, contentBg)
    case 'spacer':
      return spacerBlockToHtml(properties)
    case 'columns':
      return columnsBlockToHtml(properties, contentBg)
    case 'social':
      return socialBlockToHtml(properties)
    case 'video':
      return videoBlockToHtml(properties)
    case 'header':
      return headerBlockToHtml(properties)
    case 'footer':
      return footerBlockToHtml(properties, contentBg)
    default:
      return ''
  }
}

function textBlockToHtml(props: Record<string, any>, contentBg: string): string {
  const textColor = ensureReadableColor(props.color || '#333333', contentBg)
  return `
<tr>
  <td class="email-text" style="padding: ${props.padding}px; text-align: ${props.align}; font-size: ${props.fontSize}px; color: ${textColor}; line-height: 1.5;">
    ${props.content}
  </td>
</tr>`
}

function imageBlockToHtml(props: Record<string, any>): string {
  if (!props.src) return ''

  // Use margin for centering with display:block (more reliable in email clients)
  const marginStyle = props.align === 'center' ? 'margin: 0 auto;' : props.align === 'right' ? 'margin: 0 0 0 auto;' : 'margin: 0;'
  const img = `<img src="${props.src}" alt="${props.alt || ''}" style="display: block; max-width: ${props.width}%; height: auto; border: 0; ${marginStyle}" />`
  const content = props.link
    ? `<a href="${props.link}" style="display: block; ${marginStyle} max-width: ${props.width}%;">${img}</a>`
    : img

  return `
<tr>
  <td style="padding: ${props.padding}px;">
    ${content}
  </td>
</tr>`
}

function buttonBlockToHtml(props: Record<string, any>, contentBg: string): string {
  const width = props.fullWidth ? '100%' : 'auto'
  // Button text color should contrast with button background, not email background
  const buttonTextColor = ensureReadableColor(props.textColor || '#000000', props.bgColor || '#D4AF37')

  return `
<tr>
  <td style="padding: ${props.padding}px; text-align: ${props.align};">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 ${props.align === 'center' ? 'auto' : props.align === 'right' ? '0 0 auto' : '0'};">
      <tr>
        <td style="background-color: ${props.bgColor}; border-radius: ${props.borderRadius}px; padding: 12px 24px;">
          <a href="${props.url}" style="display: inline-block; color: ${buttonTextColor}; font-size: ${props.fontSize}px; font-weight: bold; text-decoration: none; width: ${width}; text-align: center;">
            ${props.text}
          </a>
        </td>
      </tr>
    </table>
  </td>
</tr>`
}

function dividerBlockToHtml(props: Record<string, any>, contentBg: string): string {
  const dividerColor = ensureVisibleDivider(props.color || '#E5E5E5', contentBg)
  return `
<tr>
  <td style="padding: ${props.padding}px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: ${props.width}%; margin: 0 auto;">
      <tr>
        <td class="email-divider" style="border-top: ${props.thickness}px ${props.style} ${dividerColor};"></td>
      </tr>
    </table>
  </td>
</tr>`
}

function spacerBlockToHtml(props: Record<string, any>): string {
  return `
<tr>
  <td style="height: ${props.height}px; line-height: ${props.height}px; font-size: 1px;">&nbsp;</td>
</tr>`
}

interface ColumnContent {
  type: 'text' | 'image'
  content: string
  align: string
  fontSize: number
  color: string
  src: string
  alt: string
  width: number
}

function columnsBlockToHtml(props: Record<string, any>, contentBg: string): string {
  const columnCount = props.columnCount || 2
  const widths = props.columnWidths || [50, 50]
  const columnContent: ColumnContent[] = props.columnContent || []
  const showDivider = props.showDivider || false
  const dividerColor = ensureVisibleDivider(props.dividerColor || '#E5E5E5', contentBg)
  const dividerThickness = props.dividerThickness || 1
  const gap = props.gap || 16

  const columnCells = Array.from({ length: columnCount }).map((_, idx) => {
    const col = columnContent[idx] || { type: 'text', content: '', src: '' }
    const isLast = idx === columnCount - 1

    let cellContent = ''
    if (col.type === 'image' && col.src) {
      const marginStyle = col.align === 'center' ? 'margin: 0 auto;' : col.align === 'right' ? 'margin: 0 0 0 auto;' : 'margin: 0;'
      cellContent = `<img src="${col.src}" alt="${col.alt || ''}" style="display: block; max-width: ${col.width || 100}%; height: auto; border: 0; ${marginStyle}" />`
    } else if (col.type === 'text' && col.content) {
      const textColor = ensureReadableColor(col.color || '#333333', contentBg)
      cellContent = `<div class="email-text" style="text-align: ${col.align || 'left'}; font-size: ${col.fontSize || 16}px; color: ${textColor}; line-height: 1.5;">${col.content}</div>`
    }

    const borderStyle = showDivider && !isLast ? `border-right: ${dividerThickness}px solid ${dividerColor};` : ''
    const paddingStyle = showDivider
      ? `padding: 0 ${!isLast ? gap / 2 : 0}px 0 ${idx > 0 ? gap / 2 : 0}px;`
      : `padding: 0 ${!isLast ? gap / 2 : 0}px 0 ${idx > 0 ? gap / 2 : 0}px;`

    return `<td class="email-divider" style="width: ${widths[idx] || 50}%; vertical-align: top; ${borderStyle} ${paddingStyle}">${cellContent || '&nbsp;'}</td>`
  }).join('')

  return `
<tr>
  <td style="padding: ${props.padding}px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%;">
      <tr>${columnCells}</tr>
    </table>
  </td>
</tr>`
}

function socialBlockToHtml(props: Record<string, any>): string {
  const enabledPlatforms = (props.platforms || []).filter((p: any) => p.enabled)

  const icons = enabledPlatforms.map((platform: any) => {
    const iconUrl = getSocialIconUrl(platform.name, props.iconStyle)
    return `<a href="${platform.url}" style="display: inline-block; margin: 0 8px;"><img src="${iconUrl}" alt="${platform.name}" width="${props.iconSize}" height="${props.iconSize}" style="display: block; border: 0;" /></a>`
  }).join('')

  return `
<tr>
  <td style="padding: ${props.padding}px; text-align: ${props.align};">
    ${icons}
  </td>
</tr>`
}

function videoBlockToHtml(props: Record<string, any>): string {
  if (!props.thumbnailUrl) return ''

  return `
<tr>
  <td style="padding: ${props.padding}px; text-align: ${props.align};">
    <a href="${props.videoUrl}" style="display: block; position: relative; max-width: ${props.width}%; margin: 0 auto;">
      <img src="${props.thumbnailUrl}" alt="Video" style="display: block; width: 100%; height: auto; border: 0;" />
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; background: ${props.overlayColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
        <div style="width: 0; height: 0; border-left: 20px solid ${props.playIconColor}; border-top: 12px solid transparent; border-bottom: 12px solid transparent; margin-left: 4px;"></div>
      </div>
    </a>
  </td>
</tr>`
}

function headerBlockToHtml(props: Record<string, any>): string {
  const logo = props.logoUrl
    ? `<img src="${props.logoUrl}" alt="${props.companyName}" style="display: block; max-height: 50px; width: auto; margin: 0 auto;" />`
    : `<h1 style="margin: 0; font-size: 24px; font-weight: bold; color: ${props.textColor};">${props.companyName}</h1>`

  return `
<tr>
  <td style="background-color: ${props.bgColor}; padding: ${props.padding}px; text-align: ${props.align};">
    ${logo}
  </td>
</tr>`
}

function footerBlockToHtml(props: Record<string, any>, contentBg: string): string {
  // Footer has its own background, so use that for contrast calculation
  const footerBg = props.bgColor || '#1A1A1A'
  const textColor = ensureReadableColor(props.textColor || '#999999', footerBg)

  const socialLinks = props.showSocial && props.socialLinks?.length
    ? `<p style="margin: 0 0 16px 0;">${props.socialLinks.map((s: any) =>
        `<a href="${s.url}" style="color: ${textColor}; margin: 0 8px;">${s.name}</a>`
      ).join(' | ')}</p>`
    : ''

  return `
<tr>
  <td style="background-color: ${footerBg}; padding: ${props.padding}px; text-align: center;">
    ${socialLinks}
    <p class="email-text-muted" style="margin: 0 0 8px 0; font-size: 14px; color: ${textColor};">${props.text}</p>
    ${props.unsubscribeUrl ? `<p style="margin: 0; font-size: 12px;"><a href="${props.unsubscribeUrl}" style="color: ${textColor};">Unsubscribe</a></p>` : ''}
  </td>
</tr>`
}

// Get social icon URL (placeholder - in production use actual hosted icons)
function getSocialIconUrl(platform: string, style: string): string {
  // These would be actual hosted icon URLs
  const baseUrl = 'https://cdn-icons-png.flaticon.com/512'
  const icons: Record<string, string> = {
    facebook: '733547/733547.png',
    twitter: '733579/733579.png',
    instagram: '2111463/2111463.png',
    linkedin: '3536505/3536505.png',
    youtube: '1384060/1384060.png',
  }
  return `${baseUrl}/${icons[platform] || icons.facebook}`
}

// Parse HTML/JSON body back to blocks (for editing existing templates)
export function parseBodyToBlocks(body: string): EmailBlock[] {
  try {
    // If body is JSON, parse it directly
    const parsed = JSON.parse(body)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // If not JSON, it's legacy HTML content - create a single text block
    if (body && body.trim()) {
      return [{
        id: `block-${Date.now()}`,
        type: 'text',
        properties: {
          content: body,
          align: 'left',
          padding: 16,
          fontSize: 16,
          color: '#333333',
        },
      }]
    }
  }
  return []
}
