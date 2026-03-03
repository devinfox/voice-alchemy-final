import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  // Check notes_archive for recent entries
  const { data: notes, error } = await supabase
    .from('notes_archive')
    .select('id, class_started_at, class_ended_at, recording_id, ai_summary, content')
    .order('class_ended_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Notes error:', error)
    return
  }

  console.log('Recent notes_archive entries:')
  console.log('')

  notes?.forEach(n => {
    const start = n.class_started_at ? new Date(n.class_started_at) : null
    const end = n.class_ended_at ? new Date(n.class_ended_at) : null

    console.log('Note ID:', n.id)
    console.log('  PST Start:', start?.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    console.log('  PST End:', end?.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    console.log('  Linked Recording ID:', n.recording_id || 'None')
    console.log('  Has AI Summary:', !!n.ai_summary)
    console.log('  Content preview:', n.content?.slice(0, 100) || 'None')
    console.log('')
  })

  // Also check if there are any pending uploads or recent storage files
  const { data: storageFiles, error: storageError } = await supabase
    .storage
    .from('lesson-recordings')
    .list('', { limit: 10, sortBy: { column: 'created_at', order: 'desc' } })

  if (!storageError && storageFiles) {
    console.log('\nRecent storage folders:')
    storageFiles.forEach(f => {
      console.log('  -', f.name, f.created_at)
    })
  }
}

main()
