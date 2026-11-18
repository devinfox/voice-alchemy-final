'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ToolDialogProps {
  titleId: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  /** Extra header buttons, placed before fullscreen and close. */
  actions?: React.ReactNode
  onClose: () => void
  fullscreen?: boolean
  onToggleFullscreen?: () => void
  /** Width on desktop: md 672px, lg 896px. */
  size?: 'md' | 'lg'
  /** Rendered between the header and the body (tours, banners). */
  beforeBody?: React.ReactNode
  bodyClassName?: string
  children: React.ReactNode
}

/**
 * The shell every practice tool opens in: same backdrop, corners, header and
 * padding. Full screen on phones, a centred dialog on larger screens that grows
 * with its content and only scrolls when the window is too short.
 */
export function ToolDialog({
  titleId,
  title,
  subtitle,
  icon,
  actions,
  onClose,
  fullscreen = false,
  onToggleFullscreen,
  size = 'lg',
  beforeBody,
  bodyClassName,
  children,
}: ToolDialogProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[99990] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden border-gold-400/30 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 shadow-2xl shadow-black/60 lg:rounded-3xl lg:border',
          fullscreen
            ? 'lg:h-[95vh] lg:w-[95vw]'
            : cn('lg:h-auto lg:max-h-[94vh] lg:w-[94vw]', size === 'lg' ? 'lg:max-w-4xl' : 'lg:max-w-2xl')
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-ink-800 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-400 [&_svg]:size-5">
              {icon}
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-bold leading-tight text-white">
                {title}
              </h2>
              {subtitle && <p className="hidden truncate text-xs text-gray-400 sm:block">{subtitle}</p>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {onToggleFullscreen && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden sm:inline-flex"
                onClick={onToggleFullscreen}
                title={fullscreen ? 'Exit full screen' : 'Full screen'}
                aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              >
                {fullscreen ? <Minimize2 /> : <Maximize2 />}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} title="Close" aria-label="Close">
              <X />
            </Button>
          </div>
        </header>

        {beforeBody}

        <div className={cn('relative min-h-0 flex-1 overflow-y-auto p-4 sm:p-5', bodyClassName)}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
