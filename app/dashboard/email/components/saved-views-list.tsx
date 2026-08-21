'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Folder,
  Mail,
  Reply,
  Clock,
  Paperclip,
  Star,
  Plus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useTenant } from '@/lib/tenant'

interface SavedView {
  id: string
  name: string
  icon: string
  color: string
  filters: Record<string, any>
  is_system: boolean
  is_pinned: boolean
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  folder: Folder,
  mail: Mail,
  reply: Reply,
  clock: Clock,
  paperclip: Paperclip,
  star: Star,
}

interface SavedViewsListProps {
  userId: string
}

export function SavedViewsList({ userId }: SavedViewsListProps) {
  const pathname = usePathname()
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  const { isVoiceAlchemy, gradientConfig } = useTenant()
  const { accentColor } = gradientConfig

  useEffect(() => {
    loadViews()
  }, [])

  const loadViews = async () => {
    try {
      const response = await fetch('/api/email/views')
      if (response.ok) {
        const data = await response.json()
        setViews(data)
      }
    } catch (error) {
      console.error('Error loading views:', error)
    } finally {
      setLoading(false)
    }
  }

  const isActive = (viewId: string) => {
    return pathname === `/dashboard/email/views/${viewId}`
  }

  const getActiveClasses = (active: boolean) => {
    if (!active) return 'text-gray-300 hover:bg-white/10 hover:text-white'
    if (isVoiceAlchemy) return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-white/10'
  }

  const getActiveStyle = (active: boolean) => {
    if (!active) return undefined
    if (isVoiceAlchemy) return undefined
    return {
      color: accentColor,
      borderColor: `${accentColor}40`,
      border: '1px solid',
    }
  }

  if (loading || views.length === 0) {
    return null
  }

  return (
    <div className="pt-2 mt-2 border-t border-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <span>Smart Views</span>
      </button>

      {expanded && (
        <div className="space-y-0.5 mt-1">
          {views.map((view) => {
            const active = isActive(view.id)
            const IconComponent = ICON_MAP[view.icon] || Folder

            return (
              <Link
                key={view.id}
                href={`/dashboard/email/views/${view.id}`}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${getActiveClasses(active)}`}
                style={getActiveStyle(active)}
              >
                <IconComponent
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: view.color }}
                />
                <span className="flex-1 truncate">{view.name}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
