'use client'

// ============================================================================
// EMAIL LIST SKELETON
// ============================================================================

export function EmailListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="animate-pulse">
      {/* Toolbar skeleton */}
      <div className="hidden md:flex px-4 py-2 border-b border-white/10 items-center gap-2 flex-shrink-0">
        <div className="w-5 h-5 rounded bg-white/10" />
        <div className="h-6 w-px bg-white/10" />
        <div className="w-5 h-5 rounded bg-white/10" />
        <div className="w-5 h-5 rounded bg-white/10" />
        <div className="w-5 h-5 rounded bg-white/10" />
      </div>

      {/* Thread rows */}
      <div className="space-y-0">
        {Array.from({ length: count }).map((_, i) => (
          <EmailRowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

export function EmailRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
      {/* Checkbox */}
      <div className="w-5 h-5 rounded bg-white/10" />
      {/* Star */}
      <div className="w-5 h-5 rounded bg-white/10" />
      {/* Sender */}
      <div className="w-48 flex-shrink-0">
        <div className="h-4 w-32 rounded bg-white/10" />
      </div>
      {/* Subject & Snippet */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 w-3/4 rounded bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-white/5" />
      </div>
      {/* Date */}
      <div className="w-20 flex-shrink-0">
        <div className="h-4 w-16 rounded bg-white/10 ml-auto" />
      </div>
    </div>
  )
}

// ============================================================================
// EMAIL PREVIEW SKELETON
// ============================================================================

export function EmailPreviewSkeleton() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10 flex-shrink-0">
        <div className="flex-1 h-6 w-2/3 rounded bg-white/10" />
        <div className="flex items-center gap-1">
          <div className="w-8 h-8 rounded bg-white/10" />
          <div className="w-8 h-8 rounded bg-white/10" />
          <div className="w-8 h-8 rounded bg-white/10" />
        </div>
      </div>

      {/* Email content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <EmailMessageSkeleton />
        <EmailMessageSkeleton isExpanded={false} />
      </div>
    </div>
  )
}

export function EmailMessageSkeleton({ isExpanded = true }: { isExpanded?: boolean }) {
  return (
    <div className="bg-white/5 rounded-lg overflow-hidden">
      {/* Email header */}
      <div className="flex items-start gap-3 p-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0" />

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="h-4 w-32 rounded bg-white/10" />
            <div className="h-3 w-20 rounded bg-white/5" />
          </div>
          {!isExpanded && (
            <div className="h-3 w-2/3 rounded bg-white/5" />
          )}
        </div>

        <div className="w-4 h-4 rounded bg-white/10 flex-shrink-0" />
      </div>

      {/* Email body (if expanded) */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="pl-11 space-y-3">
            {/* Details */}
            <div className="space-y-1">
              <div className="h-3 w-40 rounded bg-white/5" />
              <div className="h-3 w-48 rounded bg-white/5" />
            </div>

            {/* Body */}
            <div className="bg-white/10 rounded-lg p-4 space-y-2">
              <div className="h-4 w-full rounded bg-gray-200/20" />
              <div className="h-4 w-5/6 rounded bg-gray-200/20" />
              <div className="h-4 w-4/6 rounded bg-gray-200/20" />
              <div className="h-4 w-full rounded bg-gray-200/20" />
              <div className="h-4 w-3/4 rounded bg-gray-200/20" />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 rounded bg-white/10" />
              <div className="h-8 w-24 rounded bg-white/10" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// COMPOSE SKELETON
// ============================================================================

export function EmailComposeSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="h-5 w-28 rounded bg-white/10" />
        <div className="flex items-center gap-1">
          <div className="w-6 h-6 rounded bg-white/10" />
          <div className="w-6 h-6 rounded bg-white/10" />
        </div>
      </div>

      {/* From */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <div className="h-4 w-10 rounded bg-white/10" />
        <div className="h-8 flex-1 rounded bg-white/5" />
      </div>

      {/* To */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <div className="h-4 w-10 rounded bg-white/10" />
        <div className="h-8 flex-1 rounded bg-white/5" />
      </div>

      {/* Subject */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <div className="h-4 w-14 rounded bg-white/10" />
        <div className="h-8 flex-1 rounded bg-white/5" />
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-3">
        <div className="h-4 w-full rounded bg-white/5" />
        <div className="h-4 w-5/6 rounded bg-white/5" />
        <div className="h-4 w-3/4 rounded bg-white/5" />
        <div className="h-4 w-4/5 rounded bg-white/5" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-10 w-20 rounded bg-white/10" />
          <div className="w-10 h-10 rounded bg-white/10" />
          <div className="w-10 h-10 rounded bg-white/10" />
        </div>
        <div className="w-10 h-10 rounded bg-white/10" />
      </div>
    </div>
  )
}

// ============================================================================
// EMPTY STATES
// ============================================================================

import { Mail, Inbox, Archive, Trash2, Star, Search } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        {icon && (
          <div className="mb-4 flex justify-center">
            {icon}
          </div>
        )}
        <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
        {description && (
          <p className="text-gray-400 text-sm mb-4">{description}</p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm font-medium transition-colors"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

export function InboxEmptyState() {
  return (
    <EmptyState
      icon={<Inbox className="w-16 h-16 text-gray-600" />}
      title="Your inbox is empty"
      description="When you receive emails, they'll appear here."
    />
  )
}

export function SentEmptyState() {
  return (
    <EmptyState
      icon={<Mail className="w-16 h-16 text-gray-600" />}
      title="No sent emails"
      description="Emails you send will appear here."
    />
  )
}

export function ArchiveEmptyState() {
  return (
    <EmptyState
      icon={<Archive className="w-16 h-16 text-gray-600" />}
      title="Archive is empty"
      description="Archived conversations will appear here."
    />
  )
}

export function TrashEmptyState() {
  return (
    <EmptyState
      icon={<Trash2 className="w-16 h-16 text-gray-600" />}
      title="Trash is empty"
      description="Deleted conversations will appear here for 30 days."
    />
  )
}

export function StarredEmptyState() {
  return (
    <EmptyState
      icon={<Star className="w-16 h-16 text-gray-600" />}
      title="No starred emails"
      description="Star important conversations to find them quickly."
    />
  )
}

export function SearchEmptyState({ query }: { query?: string }) {
  return (
    <EmptyState
      icon={<Search className="w-16 h-16 text-gray-600" />}
      title="No results found"
      description={query ? `No emails matching "${query}"` : "Try a different search term."}
    />
  )
}

export function SelectEmailEmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-gray-500">
      <div className="text-center">
        <Mail className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="text-gray-400">Select a conversation to view</p>
      </div>
    </div>
  )
}
