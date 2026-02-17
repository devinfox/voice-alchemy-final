'use client'

import { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'gold' | 'subtle'
  hover?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function GlassCard({
  children,
  className = '',
  variant = 'default',
  hover = false,
  padding = 'md',
}: GlassCardProps) {
  const baseClass = variant === 'gold'
    ? 'glass-card-gold'
    : variant === 'subtle'
    ? 'glass-card-subtle'
    : 'glass-card'

  const hoverClass = hover ? 'glass-card-hover cursor-pointer' : ''
  const paddingClass = paddingClasses[padding]

  return (
    <div className={`${baseClass} ${hoverClass} ${paddingClass} ${className}`}>
      {children}
    </div>
  )
}

interface GlassStatCardProps {
  label: string
  value: string
  subValue?: string
  subValueColor?: 'green' | 'red' | 'gold' | 'gray'
  variant?: 'default' | 'gold'
}

const subValueColors = {
  green: 'text-green-400',
  red: 'text-red-400',
  gold: 'text-yellow-400',
  gray: 'text-gray-400',
}

export function GlassStatCard({
  label,
  value,
  subValue,
  subValueColor = 'gray',
  variant = 'default',
}: GlassStatCardProps) {
  return (
    <GlassCard variant={variant} padding="md">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${variant === 'gold' ? 'text-gold-gradient' : 'text-white'}`}>
        {value}
      </p>
      {subValue && (
        <p className={`text-xs mt-1 ${subValueColors[subValueColor]}`}>
          {subValue}
        </p>
      )}
    </GlassCard>
  )
}

interface GlassSectionProps {
  title: string
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function GlassSection({
  title,
  children,
  className = '',
  action,
}: GlassSectionProps) {
  return (
    <GlassCard className={className} padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </GlassCard>
  )
}
