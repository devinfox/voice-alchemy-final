'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EmailTag, TagColor } from '@/lib/email-tags-shared'

/**
 * Shared client cache of the tag list so every picker on a page reads the
 * same data and sees creations/renames immediately.
 */
type Listener = () => void
const state: { tags: EmailTag[]; loaded: boolean; loading: Promise<void> | null; error: string | null; hint: string | null } = {
  tags: [],
  loaded: false,
  loading: null,
  error: null,
  hint: null,
}
const listeners = new Set<Listener>()
const notify = () => listeners.forEach(l => l())

function setTags(next: EmailTag[]) {
  state.tags = [...next].sort((a, b) => a.name.localeCompare(b.name))
  notify()
}

async function load(force = false) {
  if (state.loaded && !force) return
  if (state.loading) return state.loading
  state.loading = (async () => {
    try {
      const res = await fetch('/api/email-tags?counts=true')
      const json = await res.json()
      if (!res.ok) {
        state.error = json.error || 'Could not load tags'
        state.hint = json.hint || null
      } else {
        state.error = null
        state.hint = null
        state.tags = ((json.data || []) as EmailTag[]).sort((a, b) => a.name.localeCompare(b.name))
      }
      state.loaded = true
    } catch (e) {
      state.error = e instanceof Error ? e.message : 'Could not load tags'
      state.loaded = true
    } finally {
      state.loading = null
      notify()
    }
  })()
  return state.loading
}

export function useTags() {
  const [, rerender] = useState(0)

  useEffect(() => {
    const l = () => rerender(n => n + 1)
    listeners.add(l)
    void load()
    return () => {
      listeners.delete(l)
    }
  }, [])

  const createTag = useCallback(async (name: string, color?: TagColor): Promise<EmailTag> => {
    const res = await fetch('/api/email-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    const json = await res.json()
    if (res.status === 409 && json.data) return json.data as EmailTag
    if (!res.ok) throw new Error(json.hint ? `${json.error}. ${json.hint}` : json.error || 'Could not create tag')
    const tag = json.data as EmailTag
    setTags([...state.tags.filter(t => t.id !== tag.id), tag])
    return tag
  }, [])

  const updateTag = useCallback(async (id: string, patch: { name?: string; color?: TagColor; description?: string | null }): Promise<EmailTag> => {
    const res = await fetch(`/api/email-tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Could not update tag')
    const tag = json.data as EmailTag
    setTags(state.tags.map(t => (t.id === id ? { ...t, ...tag } : t)))
    return tag
  }, [])

  const deleteTag = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/email-tags/${id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Could not delete tag')
    setTags(state.tags.filter(t => t.id !== id))
  }, [])

  /** Nudge the cached per-tag counts after assignments change. */
  const bumpCounts = useCallback((deltas: Record<string, number>) => {
    setTags(state.tags.map(t => (deltas[t.id] ? { ...t, count: Math.max(0, (t.count || 0) + deltas[t.id]) } : t)))
  }, [])

  return {
    tags: state.tags,
    loading: !state.loaded,
    error: state.error,
    hint: state.hint,
    refresh: () => load(true),
    createTag,
    updateTag,
    deleteTag,
    bumpCounts,
  }
}
