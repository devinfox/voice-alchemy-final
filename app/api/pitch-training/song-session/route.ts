import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// ============================================================================
// Types
// ============================================================================

interface SongSessionInput {
  startedAt: string
  endedAt: string
  songId: string
  songTitle: string
  songArtist: string
  songKey: string
  songBpm: number
  totalNotes: number
  notesInKey: number
  notesOutOfKey: number
  accuracyPercent: number
  avgCentsOff: number
}

// ============================================================================
// POST - Save a song pitch training session
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SongSessionInput = await request.json()
    const {
      startedAt,
      endedAt,
      songId,
      songTitle,
      songArtist,
      songKey,
      songBpm,
      totalNotes,
      notesInKey,
      notesOutOfKey,
      accuracyPercent,
      avgCentsOff
    } = body

    if (totalNotes === 0) {
      return NextResponse.json({ error: 'No notes recorded' }, { status: 400 })
    }

    const startTime = new Date(startedAt)
    const endTime = new Date(endedAt)
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000)
    const sessionDate = startTime.toISOString().split('T')[0]

    // Create new session
    const { data: session, error: sessionError } = await supabase
      .from('song_pitch_sessions')
      .insert({
        user_id: user.id,
        session_date: sessionDate,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        song_id: songId,
        song_title: songTitle,
        song_artist: songArtist,
        song_key: songKey,
        song_bpm: songBpm,
        total_notes: totalNotes,
        notes_in_key: notesInKey,
        notes_out_of_key: notesOutOfKey,
        accuracy_percent: accuracyPercent,
        avg_cents_off: avgCentsOff
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Song session insert error:', sessionError)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Session saved successfully',
      sessionId: session.id,
      accuracyPercent,
      saved: true
    })

  } catch (error) {
    console.error('Song pitch training session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================================================
// GET - Get user's song pitch training sessions
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data: sessions, error } = await supabase
      .from('song_pitch_sessions')
      .select('*')
      .eq('user_id', user.id)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })

    if (error) {
      console.error('Song sessions fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions })

  } catch (error) {
    console.error('Song pitch training sessions GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
