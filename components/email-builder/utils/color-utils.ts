// Color utility functions for email builder

/**
 * Calculate the relative luminance of a color
 * Based on WCAG 2.0 formula
 */
export function getLuminance(hexColor: string): number {
  // Remove # if present
  const hex = hexColor.replace('#', '')

  // Handle shorthand hex (e.g., #fff)
  const fullHex = hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex

  // Parse RGB values
  const r = parseInt(fullHex.substring(0, 2), 16) / 255
  const g = parseInt(fullHex.substring(2, 4), 16) / 255
  const b = parseInt(fullHex.substring(4, 6), 16) / 255

  // Apply gamma correction
  const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
  const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
  const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

  // Calculate luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

/**
 * Determine if a color is "light" (luminance > 0.5)
 */
export function isLightColor(hexColor: string): boolean {
  return getLuminance(hexColor) > 0.5
}

/**
 * Get appropriate text color for a given background
 * Returns dark text for light backgrounds, light text for dark backgrounds
 */
export function getContrastTextColor(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? '#333333' : '#FFFFFF'
}

/**
 * Get appropriate secondary/muted text color for a given background
 */
export function getContrastMutedColor(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? '#666666' : '#CCCCCC'
}

/**
 * Get appropriate divider/border color for a given background
 * Uses subtle contrast that works in both modes
 */
export function getContrastDividerColor(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? '#E0E0E0' : '#404040'
}

/**
 * Check if two colors have sufficient contrast (WCAG AA standard = 4.5:1)
 */
export function hasGoodContrast(foreground: string, background: string): boolean {
  const fgLum = getLuminance(foreground)
  const bgLum = getLuminance(background)

  const lighter = Math.max(fgLum, bgLum)
  const darker = Math.min(fgLum, bgLum)

  const contrastRatio = (lighter + 0.05) / (darker + 0.05)
  return contrastRatio >= 4.5
}

/**
 * Check if divider color has reasonable visibility (lower threshold than text)
 */
export function hasDividerContrast(dividerColor: string, backgroundColor: string): boolean {
  const fgLum = getLuminance(dividerColor)
  const bgLum = getLuminance(backgroundColor)

  const lighter = Math.max(fgLum, bgLum)
  const darker = Math.min(fgLum, bgLum)

  const contrastRatio = (lighter + 0.05) / (darker + 0.05)
  return contrastRatio >= 1.5 // Lower threshold for decorative elements
}

/**
 * Adjust text color if it doesn't have good contrast with background
 */
export function ensureReadableColor(textColor: string, backgroundColor: string): string {
  if (hasGoodContrast(textColor, backgroundColor)) {
    return textColor
  }
  return getContrastTextColor(backgroundColor)
}

/**
 * Adjust divider color if it doesn't have reasonable contrast with background
 */
export function ensureVisibleDivider(dividerColor: string, backgroundColor: string): string {
  if (hasDividerContrast(dividerColor, backgroundColor)) {
    return dividerColor
  }
  return getContrastDividerColor(backgroundColor)
}

/**
 * Dark mode friendly color palette
 * Colors that work reasonably well in both light and dark modes
 */
export const darkModeFriendlyColors = {
  // Text colors
  textPrimary: '#2D2D2D',      // Not pure black - better for dark mode inversion
  textSecondary: '#5A5A5A',
  textLight: '#F5F5F5',        // Not pure white - better for light mode
  textMuted: '#8A8A8A',

  // Background colors
  bgLight: '#FAFAFA',          // Slightly off-white
  bgDark: '#1E1E1E',           // Slightly off-black

  // Divider colors
  dividerLight: '#E0E0E0',
  dividerDark: '#404040',

  // Accent (gold theme)
  accent: '#D4AF37',
  accentDark: '#B8962E',
}
