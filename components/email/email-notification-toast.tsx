'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Mail, X } from 'lucide-react'

interface EmailNotification {
  id: string
  threadId: string
  fromName: string | null
  fromAddress: string
  subject: string
  timestamp: Date
}

interface EmailNotificationToastProps {
  userId: string
  accountIds: string[]
}

// Polling interval in milliseconds (check every 10 seconds for responsiveness)
const POLLING_INTERVAL = 10000

export function EmailNotificationToast({ userId, accountIds }: EmailNotificationToastProps) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<EmailNotification[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const seenEmailIds = useRef<Set<string>>(new Set())

  // Create supabase client once and memoize it
  const supabase = useMemo(() => createClient(), [])

  // Log mount status for debugging
  useEffect(() => {
    console.log('[EmailNotification] Component mounted with accountIds:', accountIds)
    return () => {
      console.log('[EmailNotification] Component unmounted')
    }
  }, [accountIds])

  // Play notification sound using Web Audio API
  const playNotificationSound = useCallback(() => {
    try {
      // Create audio context on demand (required for autoplay policies)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const ctx = audioContextRef.current

      // Create a pleasant "ding" sound
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      // Two-tone ding (like a doorbell)
      oscillator.frequency.setValueAtTime(830, ctx.currentTime) // First tone
      oscillator.frequency.setValueAtTime(1046, ctx.currentTime + 0.1) // Second tone (higher)

      oscillator.type = 'sine'

      // Envelope: quick attack, short sustain, medium decay
      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02)
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1)
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.4)
    } catch {
      // Audio might not be available, ignore
    }
  }, [])

  // When a new inbound email arrives, revalidate the current email route so the
  // inbox/folder/thread list updates live alongside the toast (those pages are
  // server components, so router.refresh() re-runs their DB fetch). Debounced so
  // a burst of arrivals triggers a single refresh, and scoped to email routes so
  // we never churn unrelated dashboard pages.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshEmailViews = useCallback(() => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/dashboard/email')) return
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => router.refresh(), 250)
  }, [router])

  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
  }, [])

  const addNotification = useCallback((notification: EmailNotification) => {
    setNotifications(prev => {
      // Don't add duplicates
      if (prev.some(n => n.id === notification.id)) return prev
      return [notification, ...prev].slice(0, 5) // Keep max 5 notifications
    })
    playNotificationSound()
    // Update the inbox/thread list at the same moment the toast appears.
    refreshEmailViews()

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 8000)
  }, [playNotificationSound, refreshEmailViews])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const handleNotificationClick = useCallback((notification: EmailNotification) => {
    dismissNotification(notification.id)
    router.push(`/dashboard/email/${notification.threadId}`)
  }, [dismissNotification, router])

  // Subscribe to new emails via Realtime
  useEffect(() => {
    if (!accountIds.length) return

    const channel = supabase
      .channel('email-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'emails',
          filter: `email_account_id=in.(${accountIds.join(',')})`,
        },
        (payload) => {
          const email = payload.new as any
          console.log('[EmailNotification] Realtime event received:', email.id)

          // Only notify for inbound emails
          if (!email.is_inbound) return

          // Skip if we've already seen this email
          if (seenEmailIds.current.has(email.id)) return
          seenEmailIds.current.add(email.id)

          addNotification({
            id: email.id,
            threadId: email.thread_id,
            fromName: email.from_name,
            fromAddress: email.from_address,
            subject: email.subject || '(no subject)',
            timestamp: new Date(),
          })
        }
      )
      .subscribe((status) => {
        console.log('[EmailNotification] Realtime subscription status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [accountIds, supabase, addNotification])

  // Fallback polling for new emails (in case Realtime isn't working)
  useEffect(() => {
    if (!accountIds.length) return

    // Use ref to track last check time without causing re-renders
    const lastCheckRef = { current: new Date() }

    const checkForNewEmails = async () => {
      console.log('[EmailNotification] Polling check at:', new Date().toISOString(), 'since:', lastCheckRef.current.toISOString())
      try {
        const { data: newEmails, error } = await supabase
          .from('emails')
          .select('id, thread_id, from_name, from_address, subject, is_inbound, created_at')
          .in('email_account_id', accountIds)
          .eq('is_inbound', true)
          .gt('created_at', lastCheckRef.current.toISOString())
          .order('created_at', { ascending: false })
          .limit(5)

        if (error) {
          console.error('[EmailNotification] Polling error:', error)
          return
        }

        console.log('[EmailNotification] Polling result:', newEmails?.length || 0, 'emails')

        if (newEmails && newEmails.length > 0) {
          console.log('[EmailNotification] Polling found new emails:', newEmails)

          for (const email of newEmails) {
            // Skip if we've already seen this email (from Realtime or previous poll)
            if (seenEmailIds.current.has(email.id)) continue
            seenEmailIds.current.add(email.id)

            addNotification({
              id: email.id,
              threadId: email.thread_id,
              fromName: email.from_name,
              fromAddress: email.from_address,
              subject: email.subject || '(no subject)',
              timestamp: new Date(email.created_at),
            })
          }
        }

        lastCheckRef.current = new Date()
      } catch (err) {
        console.error('[EmailNotification] Polling exception:', err)
      }
    }

    // Initial check after a short delay (2 seconds)
    const initialTimeout = setTimeout(checkForNewEmails, 2000)

    // Set up polling interval
    const pollInterval = setInterval(checkForNewEmails, POLLING_INTERVAL)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(pollInterval)
    }
  }, [accountIds, supabase, addNotification])

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className="pointer-events-auto animate-slide-in-right"
          style={{
            animationDelay: `${index * 50}ms`,
          }}
        >
          <div
            onClick={() => handleNotificationClick(notification)}
            className="group relative w-80 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/50 cursor-pointer overflow-hidden hover:border-yellow-500/30 transition-all duration-200"
          >
            {/* Gold accent line */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-yellow-500/50 via-yellow-400/80 to-yellow-500/50" />

            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-yellow-400" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-yellow-400/80 font-medium mb-1">New Email</p>
                  <p className="text-sm font-semibold text-white truncate">
                    {notification.fromName || notification.fromAddress.split('@')[0]}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {notification.subject}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    dismissNotification(notification.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/10 rounded-lg"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Progress bar for auto-dismiss */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
              <div
                className="h-full bg-yellow-500/50 animate-shrink-width"
                style={{ animationDuration: '8s' }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
