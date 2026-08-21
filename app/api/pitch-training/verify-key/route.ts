import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/openai'
import { createClient } from '@/lib/supabase-server'

// ============================================================================
// Verify Key API - Uses OpenAI to verify/correct song key data
// ============================================================================

interface VerifyKeyRequest {
  title: string
  artist: string
  currentKey: string
  currentMode: 'major' | 'minor'
}

interface VerifiedSongKey {
  title: string
  artist: string
  key: string
  mode: 'major' | 'minor'
  bpm: number
  confidence: number
  source: string
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyKeyRequest = await request.json()
    const { title, artist, currentKey, currentMode } = body

    if (!title || !artist) {
      return NextResponse.json({ error: 'Title and artist required' }, { status: 400 })
    }

    const supabase = await createClient()

    // First, check if we already have a verified key in our cache
    const { data: cached } = await supabase
      .from('verified_song_keys')
      .select('*')
      .ilike('title', title)
      .ilike('artist', `%${artist}%`)
      .maybeSingle()

    if (cached && cached.confidence >= 0.9) {
      return NextResponse.json({
        key: cached.key,
        mode: cached.mode,
        bpm: cached.bpm,
        source: 'cache',
        verified: true
      })
    }

    // Search the web and verify with OpenAI
    const openai = getOpenAIClient()

    // Step 1: Web search for authoritative key data
    const searchQuery = `"${title}" "${artist}" song key musical key bpm`
    let webResults = ''

    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery + ' site:tunebat.com OR site:songbpm.com OR site:musicstax.com OR site:songdata.io')}`
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })

      if (response.ok) {
        const html = await response.text()
        const snippets = html.match(/<a class="result__snippet"[^>]*>([^<]+)</g) || []
        const titles = html.match(/<a class="result__a"[^>]*>([^<]+)</g) || []
        webResults = [...titles, ...snippets].join('\n').substring(0, 4000)
      }
    } catch (e) {
      console.log('Web search failed, using AI knowledge only')
    }

    // Step 2: OpenAI to analyze and verify
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a music expert verifying song key and BPM data. Your goal is to find the MOST ACCURATE key for a song.

IMPORTANT GUIDELINES:
1. Cross-reference web search results with your training data
2. Music databases like Tunebat, SongBPM, and Musicstax are generally reliable
3. Consider the original studio recording, not live versions or remixes
4. If sources conflict, prioritize professional music databases
5. Be aware that some songs have multiple key interpretations (relative major/minor)

Return a JSON object with:
- key: The musical key (C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B)
- mode: "major" or "minor"
- bpm: The tempo as integer
- confidence: A number 0-1 indicating your confidence in this answer
- explanation: Brief explanation of your determination

The user will provide:
- The song title and artist
- Current key/mode that needs verification
- Any web search results

Be precise and authoritative in your response.`
        },
        {
          role: 'user',
          content: `Song: "${title}" by ${artist}
Current stored key: ${currentKey} ${currentMode}

${webResults ? `Web search results:\n${webResults}` : 'No web results available - use your training data.'}

Please verify/correct the key and BPM for this song.`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    try {
      const parsed = JSON.parse(content)

      // Normalize the key format
      let key = (parsed.key || currentKey).replace(/m$/i, '')
      key = key.replace('Db', 'C#').replace('Gb', 'F#') // Normalize flats to sharps where common
      const mode = parsed.mode === 'minor' ? 'minor' : 'major'
      const bpm = parseInt(parsed.bpm) || 120
      const confidence = parseFloat(parsed.confidence) || 0.7

      // Cache verified keys with high confidence
      if (confidence >= 0.8) {
        try {
          await supabase
            .from('verified_song_keys')
            .upsert({
              title: title.toLowerCase(),
              artist: artist.toLowerCase(),
              key,
              mode,
              bpm,
              confidence,
              source: webResults ? 'web+openai' : 'openai',
              verified_at: new Date().toISOString()
            }, {
              onConflict: 'title,artist'
            })
        } catch (e) {
          // Cache write failure is non-fatal
          console.log('Failed to cache verified key:', e)
        }
      }

      return NextResponse.json({
        key,
        mode,
        bpm,
        confidence,
        explanation: parsed.explanation,
        source: webResults ? 'web+openai' : 'openai',
        verified: true
      })

    } catch (e) {
      console.error('Failed to parse OpenAI response:', e)
      return NextResponse.json({ error: 'Failed to parse verification' }, { status: 500 })
    }

  } catch (error) {
    console.error('Verify key error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
