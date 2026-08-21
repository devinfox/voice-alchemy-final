'use client'

import { useState, useEffect, useRef } from 'react'
import { Link2, User, Briefcase, DollarSign, Search, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface CrmLinkPickerProps {
  threadId: string
  currentContactId?: string | null
  currentLeadId?: string | null
  currentDealId?: string | null
  onLink?: (type: 'contact' | 'lead' | 'deal', id: string | null) => void
}

interface SearchResult {
  id: string
  name: string
  email?: string
  type: 'contact' | 'lead' | 'deal'
}

export function CrmLinkPicker({
  threadId,
  currentContactId,
  currentLeadId,
  currentDealId,
  onLink,
}: CrmLinkPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [linkedItems, setLinkedItems] = useState<{
    contact?: { id: string; name: string } | null
    lead?: { id: string; name: string } | null
    deal?: { id: string; name: string } | null
  }>({})
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const hasLinks = currentContactId || currentLeadId || currentDealId

  // Load linked items on mount
  useEffect(() => {
    loadLinkedItems()
  }, [currentContactId, currentLeadId, currentDealId])

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
        setResults([])
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const loadLinkedItems = async () => {
    const supabase = createClient()
    const items: typeof linkedItems = {}

    if (currentContactId) {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .eq('id', currentContactId)
        .single()
      if (data) {
        items.contact = { id: data.id, name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Unknown' }
      }
    }

    if (currentLeadId) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, email')
        .eq('id', currentLeadId)
        .single()
      if (data) {
        items.lead = { id: data.id, name: data.name || data.email || 'Unknown Lead' }
      }
    }

    if (currentDealId) {
      const { data } = await supabase
        .from('deals')
        .select('id, name')
        .eq('id', currentDealId)
        .single()
      if (data) {
        items.deal = { id: data.id, name: data.name || 'Unknown Deal' }
      }
    }

    setLinkedItems(items)
  }

  const search = async (query: string) => {
    if (!query.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    const supabase = createClient()
    const searchResults: SearchResult[] = []

    // Search profiles (students/teachers)
    const { data: studentProfiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, name, email')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5)

    if (studentProfiles) {
      searchResults.push(...studentProfiles.map(p => ({
        id: p.id,
        name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Student',
        email: p.email,
        type: 'contact' as const,
      })))
    }

    // Search contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5)

    if (contacts) {
      searchResults.push(...contacts.map(c => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Unknown',
        email: c.email,
        type: 'contact' as const,
      })))
    }

    // Search leads
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, email')
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5)

    if (leads) {
      searchResults.push(...leads.map(l => ({
        id: l.id,
        name: l.name || l.email || 'Unknown Lead',
        email: l.email,
        type: 'lead' as const,
      })))
    }

    // Search deals
    const { data: deals } = await supabase
      .from('deals')
      .select('id, name')
      .ilike('name', `%${query}%`)
      .limit(5)

    if (deals) {
      searchResults.push(...deals.map(d => ({
        id: d.id,
        name: d.name || 'Unknown Deal',
        type: 'deal' as const,
      })))
    }

    setResults(searchResults)
    setLoading(false)
  }

  const linkItem = async (type: 'contact' | 'lead' | 'deal', id: string) => {
    setLinking(true)
    const supabase = createClient()

    const updateData: Record<string, string | null> = {
      [`${type}_id`]: id,
    }

    const { error } = await supabase
      .from('email_threads')
      .update(updateData)
      .eq('id', threadId)

    if (!error) {
      onLink?.(type, id)
      loadLinkedItems()
      setSearchQuery('')
      setResults([])
      router.refresh()
    }

    setLinking(false)
  }

  const unlinkItem = async (type: 'contact' | 'lead' | 'deal') => {
    setLinking(true)
    const supabase = createClient()

    const updateData: Record<string, null> = {
      [`${type}_id`]: null,
    }

    const { error } = await supabase
      .from('email_threads')
      .update(updateData)
      .eq('id', threadId)

    if (!error) {
      onLink?.(type, null)
      setLinkedItems(prev => ({ ...prev, [type]: null }))
      router.refresh()
    }

    setLinking(false)
  }

  const getTypeIcon = (type: 'contact' | 'lead' | 'deal') => {
    switch (type) {
      case 'contact':
        return User
      case 'lead':
        return Briefcase
      case 'deal':
        return DollarSign
    }
  }

  const getTypeColor = (type: 'contact' | 'lead' | 'deal') => {
    switch (type) {
      case 'contact':
        return 'text-blue-400'
      case 'lead':
        return 'text-green-400'
      case 'deal':
        return 'text-yellow-400'
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
          hasLinks
            ? 'bg-purple-500/20 text-purple-400'
            : 'text-gray-400 hover:bg-white/10 hover:text-white'
        }`}
        title="Link to CRM"
      >
        <Link2 className="w-3.5 h-3.5" />
        {hasLinks && <span>Linked</span>}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-white/10">
            <span className="text-xs font-medium text-gray-400 uppercase">Link to CRM</span>
          </div>

          {/* Current Links */}
          {(linkedItems.contact || linkedItems.lead || linkedItems.deal) && (
            <div className="p-2 border-b border-white/10 space-y-1">
              {linkedItems.contact && (
                <div className="flex items-center justify-between px-2 py-1.5 bg-blue-500/10 rounded">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-white">{linkedItems.contact.name}</span>
                  </div>
                  <button
                    onClick={() => unlinkItem('contact')}
                    disabled={linking}
                    className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {linkedItems.lead && (
                <div className="flex items-center justify-between px-2 py-1.5 bg-green-500/10 rounded">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-white">{linkedItems.lead.name}</span>
                  </div>
                  <button
                    onClick={() => unlinkItem('lead')}
                    disabled={linking}
                    className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {linkedItems.deal && (
                <div className="flex items-center justify-between px-2 py-1.5 bg-yellow-500/10 rounded">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-white">{linkedItems.deal.name}</span>
                  </div>
                  <button
                    onClick={() => unlinkItem('deal')}
                    disabled={linking}
                    className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  search(e.target.value)
                }}
                placeholder="Search contacts, leads, deals..."
                className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="p-4 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : results.length > 0 ? (
            <div className="max-h-48 overflow-y-auto">
              {results.map((result) => {
                const Icon = getTypeIcon(result.type)
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => linkItem(result.type, result.id)}
                    disabled={linking}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                  >
                    <Icon className={`w-4 h-4 ${getTypeColor(result.type)}`} />
                    <div className="flex-1 text-left">
                      <span className="text-sm text-white block">{result.name}</span>
                      {result.email && (
                        <span className="text-xs text-gray-500">{result.email}</span>
                      )}
                    </div>
                    <span className={`text-xs ${getTypeColor(result.type)}`}>{result.type}</span>
                  </button>
                )
              })}
            </div>
          ) : searchQuery && !loading ? (
            <div className="p-3 text-center text-sm text-gray-500">
              No results found
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
