'use client'

import { useState, useEffect } from 'react'
import { X, Mail, Clock, Users, Search, Check, AlertCircle, Loader2, Calendar } from 'lucide-react'
import { EmailTemplate } from '@/types/database.types'

interface Recipient {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

interface SendTemplateModalProps {
  template: EmailTemplate
  onClose: () => void
  onSuccess: () => void
}

export function SendTemplateModal({
  template,
  onClose,
  onSuccess,
}: SendTemplateModalProps) {
  const [leads, setLeads] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch students/users with email addresses (VAAA has no CRM leads table)
  useEffect(() => {
    async function fetchLeads() {
      try {
        const response = await fetch('/api/students/list-for-email?hasEmail=true')
        const result = await response.json()

        if (response.ok && result.data) {
          setLeads(result.data)
        }
      } catch (err) {
        console.error('Error fetching recipients:', err)
        setError('Failed to load recipients')
      } finally {
        setLoading(false)
      }
    }

    fetchLeads()
  }, [])

  const filteredLeads = searchQuery
    ? leads.filter((l) => {
        const name = `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase()
        const email = (l.email || '').toLowerCase()
        const query = searchQuery.toLowerCase()
        return name.includes(query) || email.includes(query)
      })
    : leads

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId]
    )
  }

  const selectAll = () => {
    setSelectedLeadIds(filteredLeads.map((l) => l.id))
  }

  const deselectAll = () => {
    setSelectedLeadIds([])
  }

  const handleSend = async () => {
    if (selectedLeadIds.length === 0) {
      setError('Please select at least one recipient')
      return
    }

    if (sendMode === 'schedule' && (!scheduledDate || !scheduledTime)) {
      setError('Please select a date and time for scheduling')
      return
    }

    setSending(true)
    setError(null)

    try {
      const scheduledAt =
        sendMode === 'schedule'
          ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
          : null

      const response = await fetch('/api/email-templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          lead_ids: selectedLeadIds,
          scheduled_at: scheduledAt,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to send emails')
        return
      }

      const action = sendMode === 'schedule' ? 'scheduled' : 'sent'
      setSuccessMessage(
        `Successfully ${action} ${result.sent} email${result.sent > 1 ? 's' : ''}!`
      )
      setTimeout(() => {
        onSuccess()
      }, 1500)
    } catch (err) {
      console.error('Error sending emails:', err)
      setError('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // Set minimum date/time to now
  const now = new Date()
  const minDate = now.toISOString().split('T')[0]
  const minTime = scheduledDate === minDate ? now.toTimeString().slice(0, 5) : '00:00'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden glass-card rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Send Template</h2>
              <p className="text-sm text-gray-400">{template.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Success Message */}
          {successMessage && (
            <div className="flex items-center gap-3 p-4 bg-green-500/20 border border-green-500/30 rounded-lg">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className="text-green-300">{successMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-300">{error}</span>
            </div>
          )}

          {!successMessage && (
            <>
              {/* Template Preview */}
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-gray-400 mb-1">Subject</p>
                <p className="text-white font-medium">{template.subject}</p>
              </div>

              {/* Send Mode Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  When to send
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSendMode('now')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                      sendMode === 'now'
                        ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <Mail className="w-5 h-5" />
                    Send Now
                  </button>
                  <button
                    onClick={() => setSendMode('schedule')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                      sendMode === 'schedule'
                        ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <Clock className="w-5 h-5" />
                    Schedule
                  </button>
                </div>
              </div>

              {/* Schedule Options */}
              {sendMode === 'schedule' && (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Date
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={minDate}
                        className="glass-input w-full pl-10 pr-4 py-2"
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Time
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        min={minTime}
                        className="glass-input w-full pl-10 pr-4 py-2"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Lead Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-300">
                    Select Recipients
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-yellow-400 hover:text-yellow-300"
                    >
                      Select All
                    </button>
                    <span className="text-gray-600">|</span>
                    <button
                      onClick={deselectAll}
                      className="text-xs text-gray-400 hover:text-gray-300"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search leads..."
                    className="glass-input w-full pl-10 pr-4 py-2"
                  />
                </div>

                {/* Leads List */}
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-yellow-400 animate-spin" />
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-400">No leads found with email addresses</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {filteredLeads.map((lead) => {
                      const isSelected = selectedLeadIds.includes(lead.id)

                      return (
                        <button
                          key={lead.id}
                          onClick={() => toggleLead(lead.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-all ${
                            isSelected
                              ? 'border-yellow-500/50 bg-yellow-500/10'
                              : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-5 h-5 rounded border flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-yellow-500 border-yellow-500'
                                    : 'border-gray-500'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-black" />}
                              </div>
                              <div>
                                <p className="font-medium text-white">
                                  {lead.first_name} {lead.last_name}
                                </p>
                                <p className="text-xs text-gray-400">{lead.email}</p>
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!successMessage && (
          <div className="flex items-center justify-between p-4 border-t border-white/10">
            <p className="text-sm text-gray-400">
              {selectedLeadIds.length > 0
                ? `${selectedLeadIds.length} recipient${selectedLeadIds.length > 1 ? 's' : ''} selected`
                : 'Select recipients to send'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || selectedLeadIds.length === 0}
                className="px-6 py-2 glass-button-gold rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                {sending
                  ? 'Sending...'
                  : sendMode === 'schedule'
                  ? 'Schedule Emails'
                  : 'Send Now'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
