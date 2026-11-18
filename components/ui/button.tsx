import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * The one button. Three heights (32 / 40 / 48px), 12px corners, one focus ring.
 * Use `buttonVariants()` on a <Link> when the button navigates.
 *
 *   primary    the single main action on a surface (solid gold)
 *   secondary  every other action (quiet glass)
 *   outline    an accent action that must not compete with primary
 *   ghost      low-emphasis and icon-only actions
 *   danger     destructive actions
 *   success    an "on" state such as a live microphone
 */
const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-gold-400 text-ink-900 shadow-sm shadow-black/20 hover:bg-gold-300 active:bg-gold-500',
        secondary: 'border border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1] active:bg-white/[0.14]',
        outline: 'border border-gold-400/45 text-gold-400 hover:bg-gold-400/10 active:bg-gold-400/15',
        ghost: 'text-gray-300 hover:bg-white/[0.08] hover:text-white active:bg-white/[0.12]',
        danger: 'border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 active:bg-red-500/25',
        success: 'bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-12 px-5 text-sm [&_svg]:size-4',
        'icon-sm': 'size-8 [&_svg]:size-4',
        icon: 'size-10 [&_svg]:size-5',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, block }), className)} {...props} />
  )
)
Button.displayName = 'Button'

export { Button, buttonVariants }
