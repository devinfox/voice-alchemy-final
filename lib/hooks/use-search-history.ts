'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'email-search-history'
const MAX_HISTORY = 10

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([])

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch (error) {
      console.error('Error loading search history:', error)
    }
  }, [])

  // Add a search to history
  const addToHistory = useCallback((query: string) => {
    if (!query.trim()) return

    setHistory((prev) => {
      // Remove duplicate if exists
      const filtered = prev.filter((q) => q !== query)
      // Add to front
      const newHistory = [query, ...filtered].slice(0, MAX_HISTORY)

      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
      } catch (error) {
        console.error('Error saving search history:', error)
      }

      return newHistory
    })
  }, [])

  // Remove a specific item from history
  const removeFromHistory = useCallback((query: string) => {
    setHistory((prev) => {
      const newHistory = prev.filter((q) => q !== query)

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory))
      } catch (error) {
        console.error('Error saving search history:', error)
      }

      return newHistory
    })
  }, [])

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Error clearing search history:', error)
    }
  }, [])

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  }
}
