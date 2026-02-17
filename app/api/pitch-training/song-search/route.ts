import { NextRequest, NextResponse } from 'next/server'
import { getOpenAIClient } from '@/lib/openai'

// ============================================================================
// Song Search API - Uses Web Search + OpenAI for accurate key/BPM data
// ============================================================================

interface SongResult {
  id: string
  title: string
  artist: string
  key: string
  bpm: number
  mode: 'major' | 'minor'
}

// Search the web for song key/BPM info, then parse with OpenAI
async function searchWithWebAndOpenAI(query: string): Promise<SongResult[]> {
  try {
    const openai = getOpenAIClient()

    // Step 1: Search the web for song key/BPM information
    const searchQuery = `${query} song key bpm tempo musical`
    let webResults = ''

    try {
      // Try DuckDuckGo HTML search (no API key needed)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery + ' site:tunebat.com OR site:songbpm.com OR site:musicstax.com')}`
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      })

      if (response.ok) {
        const html = await response.text()
        // Extract text snippets from search results
        const snippets = html.match(/<a class="result__snippet"[^>]*>([^<]+)</g) || []
        const titles = html.match(/<a class="result__a"[^>]*>([^<]+)</g) || []
        webResults = [...titles, ...snippets].join('\n').substring(0, 3000)
      }
    } catch (e) {
      console.log('Web search failed, using AI knowledge only')
    }

    // Step 2: Use OpenAI to interpret results (with or without web data)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a music expert. Find the KEY and BPM for songs based on the search query and any web search results provided.

IMPORTANT: Look for common key/BPM data from music databases like Tunebat, SongBPM, or Musicstax in the search results.

Return a JSON object with a "songs" array (up to 5 songs). Each song needs:
- title: exact song title
- artist: artist name
- key: musical key (C, C#, D, Eb, E, F, F#, G, Ab, A, Bb, B)
- bpm: tempo as integer
- mode: "major" or "minor"

Be as accurate as possible. Cross-reference with your knowledge of popular songs.
If web results mention specific keys/BPMs, use those values.

Example: {"songs":[{"title":"Blinding Lights","artist":"The Weeknd","key":"F","bpm":171,"mode":"minor"}]}`
        },
        {
          role: 'user',
          content: webResults
            ? `Search query: "${query}"\n\nWeb search results:\n${webResults}\n\nExtract accurate song key and BPM data.`
            : `Find the key and BPM for songs matching: "${query}"`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1000
    })

    const content = completion.choices[0]?.message?.content
    if (!content) return []

    try {
      const parsed = JSON.parse(content)
      const songs = parsed.songs || []

      return songs.slice(0, 10).map((song: any, index: number) => ({
        id: `web_${index}_${Date.now()}`,
        title: song.title || 'Unknown',
        artist: song.artist || 'Unknown Artist',
        key: (song.key || 'C').replace(/m$/i, ''),
        bpm: parseInt(song.bpm) || 120,
        mode: song.mode === 'minor' || /m$/i.test(song.key || '') ? 'minor' : 'major'
      }))
    } catch (e) {
      console.error('Failed to parse OpenAI response:', e)
      return []
    }

  } catch (error) {
    console.error('Search error:', error)
    return []
  }
}

// Fallback database with 100+ songs
const SONG_DATABASE: SongResult[] = [
  // Pop Hits
  { id: '1', title: 'Shape of You', artist: 'Ed Sheeran', key: 'C#', bpm: 96, mode: 'minor' },
  { id: '2', title: 'Blinding Lights', artist: 'The Weeknd', key: 'F', bpm: 171, mode: 'minor' },
  { id: '3', title: 'Someone Like You', artist: 'Adele', key: 'A', bpm: 68, mode: 'major' },
  { id: '4', title: 'Rolling in the Deep', artist: 'Adele', key: 'C', bpm: 105, mode: 'minor' },
  { id: '5', title: 'Hello', artist: 'Adele', key: 'F', bpm: 79, mode: 'minor' },
  { id: '6', title: 'Thinking Out Loud', artist: 'Ed Sheeran', key: 'D', bpm: 79, mode: 'major' },
  { id: '7', title: 'Perfect', artist: 'Ed Sheeran', key: 'Ab', bpm: 95, mode: 'major' },
  { id: '8', title: 'Photograph', artist: 'Ed Sheeran', key: 'E', bpm: 108, mode: 'major' },
  { id: '9', title: 'Bad Guy', artist: 'Billie Eilish', key: 'G', bpm: 135, mode: 'minor' },
  { id: '10', title: 'Lovely', artist: 'Billie Eilish', key: 'E', bpm: 115, mode: 'minor' },

  // Taylor Swift
  { id: '11', title: 'Shake It Off', artist: 'Taylor Swift', key: 'G', bpm: 160, mode: 'major' },
  { id: '12', title: 'Blank Space', artist: 'Taylor Swift', key: 'F', bpm: 96, mode: 'major' },
  { id: '13', title: 'Love Story', artist: 'Taylor Swift', key: 'D', bpm: 119, mode: 'major' },
  { id: '14', title: 'Anti-Hero', artist: 'Taylor Swift', key: 'E', bpm: 97, mode: 'major' },
  { id: '15', title: 'All Too Well', artist: 'Taylor Swift', key: 'G', bpm: 93, mode: 'major' },
  { id: '16', title: 'Cruel Summer', artist: 'Taylor Swift', key: 'A', bpm: 170, mode: 'major' },
  { id: '17', title: 'Cardigan', artist: 'Taylor Swift', key: 'Bb', bpm: 130, mode: 'major' },

  // Bruno Mars
  { id: '18', title: 'Uptown Funk', artist: 'Bruno Mars', key: 'D', bpm: 115, mode: 'minor' },
  { id: '19', title: 'Just the Way You Are', artist: 'Bruno Mars', key: 'F', bpm: 109, mode: 'major' },
  { id: '20', title: '24K Magic', artist: 'Bruno Mars', key: 'F', bpm: 107, mode: 'minor' },
  { id: '21', title: 'Grenade', artist: 'Bruno Mars', key: 'D', bpm: 111, mode: 'minor' },
  { id: '22', title: 'Locked Out of Heaven', artist: 'Bruno Mars', key: 'D', bpm: 144, mode: 'minor' },

  // Classic Rock
  { id: '23', title: 'Bohemian Rhapsody', artist: 'Queen', key: 'Bb', bpm: 72, mode: 'major' },
  { id: '24', title: 'Hotel California', artist: 'Eagles', key: 'B', bpm: 74, mode: 'minor' },
  { id: '25', title: 'Stairway to Heaven', artist: 'Led Zeppelin', key: 'A', bpm: 82, mode: 'minor' },
  { id: '26', title: 'Sweet Child O Mine', artist: "Guns N' Roses", key: 'D', bpm: 126, mode: 'major' },
  { id: '27', title: 'Wonderwall', artist: 'Oasis', key: 'F#', bpm: 87, mode: 'minor' },
  { id: '28', title: 'Smells Like Teen Spirit', artist: 'Nirvana', key: 'F', bpm: 117, mode: 'minor' },
  { id: '29', title: "Don't Stop Believin'", artist: 'Journey', key: 'E', bpm: 119, mode: 'major' },

  // Beatles
  { id: '30', title: 'Let It Be', artist: 'The Beatles', key: 'C', bpm: 71, mode: 'major' },
  { id: '31', title: 'Hey Jude', artist: 'The Beatles', key: 'F', bpm: 74, mode: 'major' },
  { id: '32', title: 'Yesterday', artist: 'The Beatles', key: 'F', bpm: 96, mode: 'major' },
  { id: '33', title: 'Here Comes the Sun', artist: 'The Beatles', key: 'A', bpm: 129, mode: 'major' },
  { id: '34', title: 'Come Together', artist: 'The Beatles', key: 'D', bpm: 82, mode: 'minor' },

  // Michael Jackson
  { id: '35', title: 'Billie Jean', artist: 'Michael Jackson', key: 'F#', bpm: 117, mode: 'minor' },
  { id: '36', title: 'Beat It', artist: 'Michael Jackson', key: 'E', bpm: 139, mode: 'minor' },
  { id: '37', title: 'Thriller', artist: 'Michael Jackson', key: 'C#', bpm: 118, mode: 'minor' },
  { id: '38', title: 'Smooth Criminal', artist: 'Michael Jackson', key: 'A', bpm: 118, mode: 'minor' },
  { id: '39', title: 'The Way You Make Me Feel', artist: 'Michael Jackson', key: 'Ab', bpm: 112, mode: 'major' },

  // Lady Gaga
  { id: '40', title: 'Shallow', artist: 'Lady Gaga & Bradley Cooper', key: 'G', bpm: 96, mode: 'major' },
  { id: '41', title: 'Bad Romance', artist: 'Lady Gaga', key: 'A', bpm: 119, mode: 'minor' },
  { id: '42', title: 'Poker Face', artist: 'Lady Gaga', key: 'G#', bpm: 120, mode: 'minor' },
  { id: '43', title: 'Born This Way', artist: 'Lady Gaga', key: 'F#', bpm: 124, mode: 'major' },

  // Beyoncé
  { id: '44', title: 'Halo', artist: 'Beyoncé', key: 'A', bpm: 80, mode: 'major' },
  { id: '45', title: 'Crazy in Love', artist: 'Beyoncé', key: 'D', bpm: 99, mode: 'minor' },
  { id: '46', title: 'Single Ladies', artist: 'Beyoncé', key: 'E', bpm: 97, mode: 'major' },
  { id: '47', title: 'Love on Top', artist: 'Beyoncé', key: 'C', bpm: 128, mode: 'major' },
  { id: '48', title: 'If I Were a Boy', artist: 'Beyoncé', key: 'Db', bpm: 90, mode: 'major' },

  // Coldplay
  { id: '49', title: 'Viva La Vida', artist: 'Coldplay', key: 'Ab', bpm: 138, mode: 'major' },
  { id: '50', title: 'Fix You', artist: 'Coldplay', key: 'Eb', bpm: 69, mode: 'major' },
  { id: '51', title: 'The Scientist', artist: 'Coldplay', key: 'F', bpm: 74, mode: 'major' },
  { id: '52', title: 'Yellow', artist: 'Coldplay', key: 'B', bpm: 87, mode: 'major' },
  { id: '53', title: 'Paradise', artist: 'Coldplay', key: 'Bb', bpm: 139, mode: 'major' },
  { id: '54', title: 'Clocks', artist: 'Coldplay', key: 'Eb', bpm: 131, mode: 'major' },

  // John Legend & Others
  { id: '55', title: 'All of Me', artist: 'John Legend', key: 'Ab', bpm: 63, mode: 'major' },
  { id: '56', title: 'Ordinary People', artist: 'John Legend', key: 'Eb', bpm: 69, mode: 'major' },
  { id: '57', title: 'Stay With Me', artist: 'Sam Smith', key: 'C', bpm: 84, mode: 'minor' },
  { id: '58', title: "I'm Not the Only One", artist: 'Sam Smith', key: 'G', bpm: 82, mode: 'major' },
  { id: '59', title: 'Happy', artist: 'Pharrell Williams', key: 'F', bpm: 160, mode: 'minor' },
  { id: '60', title: 'Get Lucky', artist: 'Daft Punk', key: 'B', bpm: 116, mode: 'minor' },

  // Whitney Houston & Classics
  { id: '61', title: 'I Will Always Love You', artist: 'Whitney Houston', key: 'A', bpm: 67, mode: 'major' },
  { id: '62', title: 'Greatest Love of All', artist: 'Whitney Houston', key: 'E', bpm: 60, mode: 'major' },
  { id: '63', title: "I Wanna Dance with Somebody", artist: 'Whitney Houston', key: 'C', bpm: 119, mode: 'major' },
  { id: '64', title: 'Respect', artist: 'Aretha Franklin', key: 'C', bpm: 115, mode: 'major' },
  { id: '65', title: 'Natural Woman', artist: 'Aretha Franklin', key: 'A', bpm: 77, mode: 'major' },

  // Standards & Jazz
  { id: '66', title: 'Fly Me to the Moon', artist: 'Frank Sinatra', key: 'C', bpm: 120, mode: 'major' },
  { id: '67', title: 'New York, New York', artist: 'Frank Sinatra', key: 'D', bpm: 104, mode: 'major' },
  { id: '68', title: 'My Way', artist: 'Frank Sinatra', key: 'D', bpm: 78, mode: 'major' },
  { id: '69', title: 'Imagine', artist: 'John Lennon', key: 'C', bpm: 75, mode: 'major' },
  { id: '70', title: 'Hallelujah', artist: 'Leonard Cohen', key: 'C', bpm: 56, mode: 'major' },

  // Stevie Wonder
  { id: '71', title: 'Superstition', artist: 'Stevie Wonder', key: 'E', bpm: 100, mode: 'minor' },
  { id: '72', title: "Isn't She Lovely", artist: 'Stevie Wonder', key: 'E', bpm: 128, mode: 'major' },
  { id: '73', title: 'I Just Called to Say I Love You', artist: 'Stevie Wonder', key: 'Db', bpm: 98, mode: 'major' },
  { id: '74', title: 'Signed Sealed Delivered', artist: 'Stevie Wonder', key: 'F', bpm: 132, mode: 'major' },

  // Modern Hits
  { id: '75', title: 'Drivers License', artist: 'Olivia Rodrigo', key: 'Bb', bpm: 72, mode: 'major' },
  { id: '76', title: 'Good 4 U', artist: 'Olivia Rodrigo', key: 'A', bpm: 166, mode: 'major' },
  { id: '77', title: 'Traitor', artist: 'Olivia Rodrigo', key: 'Bb', bpm: 87, mode: 'minor' },
  { id: '78', title: 'Watermelon Sugar', artist: 'Harry Styles', key: 'D', bpm: 95, mode: 'minor' },
  { id: '79', title: 'As It Was', artist: 'Harry Styles', key: 'F', bpm: 174, mode: 'major' },
  { id: '80', title: 'Sign of the Times', artist: 'Harry Styles', key: 'F', bpm: 120, mode: 'major' },

  // Dua Lipa
  { id: '81', title: "Don't Start Now", artist: 'Dua Lipa', key: 'B', bpm: 124, mode: 'minor' },
  { id: '82', title: 'Levitating', artist: 'Dua Lipa', key: 'B', bpm: 103, mode: 'minor' },
  { id: '83', title: 'New Rules', artist: 'Dua Lipa', key: 'B', bpm: 116, mode: 'minor' },
  { id: '84', title: 'Physical', artist: 'Dua Lipa', key: 'F#', bpm: 123, mode: 'minor' },

  // Ariana Grande
  { id: '85', title: 'Thank U, Next', artist: 'Ariana Grande', key: 'F', bpm: 107, mode: 'major' },
  { id: '86', title: 'Positions', artist: 'Ariana Grande', key: 'A', bpm: 144, mode: 'major' },
  { id: '87', title: '7 Rings', artist: 'Ariana Grande', key: 'Ab', bpm: 140, mode: 'minor' },
  { id: '88', title: 'Into You', artist: 'Ariana Grande', key: 'F#', bpm: 108, mode: 'minor' },

  // The Weeknd
  { id: '89', title: 'Starboy', artist: 'The Weeknd', key: 'A', bpm: 186, mode: 'minor' },
  { id: '90', title: 'Save Your Tears', artist: 'The Weeknd', key: 'C', bpm: 118, mode: 'minor' },
  { id: '91', title: 'The Hills', artist: 'The Weeknd', key: 'F', bpm: 113, mode: 'minor' },
  { id: '92', title: "Can't Feel My Face", artist: 'The Weeknd', key: 'A', bpm: 108, mode: 'minor' },

  // Post Malone
  { id: '93', title: 'Circles', artist: 'Post Malone', key: 'C', bpm: 120, mode: 'minor' },
  { id: '94', title: 'Sunflower', artist: 'Post Malone', key: 'D', bpm: 90, mode: 'major' },
  { id: '95', title: 'Rockstar', artist: 'Post Malone', key: 'B', bpm: 160, mode: 'minor' },

  // More Classics
  { id: '96', title: 'Somebody That I Used to Know', artist: 'Gotye', key: 'D', bpm: 129, mode: 'minor' },
  { id: '97', title: 'Use Somebody', artist: 'Kings of Leon', key: 'C', bpm: 135, mode: 'major' },
  { id: '98', title: 'Mr. Brightside', artist: 'The Killers', key: 'D', bpm: 148, mode: 'major' },
  { id: '99', title: 'Valerie', artist: 'Amy Winehouse', key: 'Eb', bpm: 148, mode: 'major' },
  { id: '100', title: 'Rehab', artist: 'Amy Winehouse', key: 'C', bpm: 145, mode: 'major' },
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.toLowerCase().trim()

    if (!query || query.length < 2) {
      return NextResponse.json({
        songs: [],
        error: 'Please enter at least 2 characters to search'
      })
    }

    // First check local database for exact/close matches
    const localMatches = SONG_DATABASE.filter(song =>
      song.title.toLowerCase().includes(query) ||
      song.artist.toLowerCase().includes(query)
    ).slice(0, 5)

    // If we have good local matches, return them immediately
    if (localMatches.length >= 3) {
      return NextResponse.json({ songs: localMatches, source: 'database' })
    }

    // Use Web Search + OpenAI to find songs not in our database
    const webResults = await searchWithWebAndOpenAI(query)

    if (webResults.length > 0) {
      // Combine with any local matches, deduplicating
      const combined = [...localMatches]
      for (const song of webResults) {
        if (!combined.some(s =>
          s.title.toLowerCase() === song.title.toLowerCase() &&
          s.artist.toLowerCase() === song.artist.toLowerCase()
        )) {
          combined.push(song)
        }
      }
      return NextResponse.json({ songs: combined.slice(0, 10), source: 'web+openai' })
    }

    // Fallback to local database only
    if (localMatches.length > 0) {
      return NextResponse.json({ songs: localMatches, source: 'database' })
    }

    return NextResponse.json({
      songs: [],
      message: 'No songs found. Try a popular artist or song title.'
    })

  } catch (error) {
    console.error('Song search error:', error)
    // Return local results on error
    const query = new URL(request.url).searchParams.get('q')?.toLowerCase() || ''
    const fallback = SONG_DATABASE.filter(song =>
      song.title.toLowerCase().includes(query) ||
      song.artist.toLowerCase().includes(query)
    ).slice(0, 10)

    return NextResponse.json({ songs: fallback, source: 'database_fallback' })
  }
}
