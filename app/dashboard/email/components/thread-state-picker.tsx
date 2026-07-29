'use client'

import { useState, useRef, useEffect } from 'react'
import { Clock, CheckCircle, MessageSquare, Send, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type WorkflowState = 'needs_response' | 'waiting_on_reply' | 'snoozed' | 'done' | null

interface ThreadStatePickerProps {
  threadId: string
  currentState: WorkflowState
  onStateChange?: (state: WorkflowState) => void
}

const STATES = [
  {
    value: null as WorkflowState,
    label: 'Clear state',
    icon: Circle,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
  },
  {
    value: 'needs_response' as WorkflowState,
    label: 'Needs Response',
    icon: MessageSquare,
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
  },
  {
    value: 'waiting_on_reply' as WorkflowState,
    label: 'Waiting on Reply',
    icon: Send,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
  },
  {
    value: 'done' as WorkflowState,
    label: 'Done',
    icon: CheckCircle,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
]

export function ThreadStatePicker({
  threadId,
  currentState,
  onStateChange,
}: ThreadStatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [state, setState] = useState<WorkflowState>(currentState)
  const [saving, setSaving] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const currentStateConfig = STATES.find(s => s.value === state) || STATES[0]

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleStateChange = async (newState: WorkflowState) => {
    if (saving) return

    // Optimistic update
    setState(newState)
    setIsOpen(false)
    onStateChange?.(newState)

    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('email_threads')
        .update({
          workflow_state: newState,
          snoozed_until: null, // Clear snooze when manually setting state
        })
        .eq('id', threadId)

      if (error) {
        console.error('Error updating thread state:', error)
        // Revert on error
        setState(currentState)
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Error updating thread state:', error)
      setState(currentState)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
          state ? currentStateConfig.bgColor : 'hover:bg-white/10'
        } ${currentStateConfig.color}`}
        title="Workflow state"
      >
        <currentStateConfig.icon className="w-3.5 h-3.5" />
        {state && <span>{currentStateConfig.label}</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-white/10">
            <span className="text-xs font-medium text-gray-400 uppercase">
              Workflow State
            </span>
          </div>
          <div className="py-1">
            {STATES.map((stateOption) => {
              const isSelected = state === stateOption.value
              return (
                <button
                  key={stateOption.value || 'null'}
                  onClick={() => handleStateChange(stateOption.value)}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors ${
                    isSelected ? 'bg-white/5' : ''
                  }`}
                >
                  <stateOption.icon className={`w-4 h-4 ${stateOption.color}`} />
                  <span className="text-sm text-white">{stateOption.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
