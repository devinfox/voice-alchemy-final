'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, Clock, Trash2 } from 'lucide-react'
import { useDebouncedCallback } from 'use-debounce'
import { useSearchHistory } from '@/lib/hooks/use-search-history'
import { getSearchSuggestions } from '@/lib/email-search-parser'

interface EmailSearchProps {
  placeholder?: string
}

const OPERATOR_HINTS = [
  { operator: 'is:unread', description: 'Unread emails' },
  { operator: 'is:starred', description: 'Starred emails' },
  { operator: 'has:attachment', description: 'Emails with attachments' },
  { operator: 'from:email', description: 'From specific sender' },
  { operator: 'to:email', description: 'To specific recipient' },
  { operator: 'in:inbox', description: 'In inbox folder' },
  { operator: 'before:YYYY-MM-DD', description: 'Before date' },
  { operator: 'after:YYYY-MM-DD', description: 'After date' },
  { operator: 'label:name', description: 'Has specific label' },
]

export function EmailSearch({ placeholder = 'Search emails...' }: EmailSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') || '')
  const [isOpen, setIsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { history, addToHistory, removeFromHistory, clearHistory } = useSearchHistory()

  // Update URL with debounced search
  const debouncedSearch = useDebouncedCallback((searchValue: string) => {
    const params = new URLSearchParams(searchParams.toString())

    if (searchValue.trim()) {
      params.set('q', searchValue.trim())
      params.delete('page') // Reset to page 1 on new search
    } else {
      params.delete('q')
    }

    router.push(`?${params.toString()}`)
  }, 300)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    debouncedSearch(newValue)

    // Update suggestions
    const newSuggestions = getSearchSuggestions(newValue)
    setSuggestions(newSuggestions)
    setSelectedIndex(-1)
  }

  const handleSubmit = (searchValue: string) => {
    if (searchValue.trim()) {
      addToHistory(searchValue.trim())
    }
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = suggestions.length > 0 ? suggestions : history

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          const selected = items[selectedIndex]
          setValue(selected)
          debouncedSearch(selected)
          handleSubmit(selected)
        } else {
          handleSubmit(value)
        }
        break
      case 'Escape':
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  const clearSearch = () => {
    setValue('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    params.delete('page')
    router.push(`?${params.toString()}`)
    setIsOpen(false)
  }

  const selectSuggestion = (suggestion: string) => {
    // For operators like "from:" we want to append to current input
    const lastWord = value.split(/\s+/).pop() || ''
    if (suggestion.endsWith(':') || (lastWord && suggestion.startsWith(lastWord))) {
      // Replace the last partial word with the full suggestion
      const beforeLastWord = value.slice(0, value.length - lastWord.length)
      const newValue = beforeLastWord + suggestion + ' '
      setValue(newValue)
      debouncedSearch(newValue)
    } else {
      setValue(suggestion)
      debouncedSearch(suggestion)
      handleSubmit(suggestion)
    }
    inputRef.current?.focus()
  }

  const selectHistory = (query: string) => {
    setValue(query)
    debouncedSearch(query)
    handleSubmit(query)
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Sync with URL on mount/change
  useEffect(() => {
    setValue(searchParams.get('q') || '')
  }, [searchParams])

  const showHistory = history.length > 0 && !value
  const showSuggestions = suggestions.length > 0 && value
  const showOperatorHints = !value && !showHistory

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/20"
      />
      {value && (
        <button
          onClick={clearSearch}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (showHistory || showSuggestions || showOperatorHints) && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden"
        >
          {/* Suggestions */}
          {showSuggestions && (
            <div className="py-1">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  onClick={() => selectSuggestion(suggestion)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    index === selectedIndex ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <Search className="w-4 h-4 text-gray-500" />
                  <span className="font-mono">{suggestion}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search History */}
          {showHistory && (
            <div>
              <div className="px-3 py-2 flex items-center justify-between border-b border-white/10">
                <span className="text-xs font-medium text-gray-400 uppercase">Recent Searches</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    clearHistory()
                  }}
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="py-1">
                {history.map((query, index) => (
                  <div
                    key={query}
                    className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                      index === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <button
                      onClick={() => selectHistory(query)}
                      className="flex-1 flex items-center gap-2 text-sm text-left text-gray-300"
                    >
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{query}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFromHistory(query)
                      }}
                      className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operator Hints */}
          {showOperatorHints && (
            <div>
              <div className="px-3 py-2 border-b border-white/10">
                <span className="text-xs font-medium text-gray-400 uppercase">Search Operators</span>
              </div>
              <div className="py-1 max-h-60 overflow-y-auto">
                {OPERATOR_HINTS.map((hint) => (
                  <button
                    key={hint.operator}
                    onClick={() => selectSuggestion(hint.operator.replace('email', '').replace('name', '').replace('YYYY-MM-DD', ''))}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="font-mono text-yellow-400">{hint.operator}</span>
                    <span className="text-gray-500 text-xs">{hint.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
