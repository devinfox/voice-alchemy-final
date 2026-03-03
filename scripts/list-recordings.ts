import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  const { data: recordings, error } = await supabase
    .from('lesson_recordings')
    .select('id, started_at, ended_at, created_at, ai_processing_status, storage_path, transcript')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error(error)
    return
  }

  console.log('All recent recordings:')
  console.log('')

  recordings?.forEach(r => {
    const start = new Date(r.started_at || r.created_at)
    const end = r.ended_at ? new Date(r.ended_at) : null

    console.log('ID:', r.id)
    console.log('  PST Start:', start.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    console.log('  PST End:', end?.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    console.log('  Status:', r.ai_processing_status)
    console.log('  Has Storage:', !!r.storage_path)
    console.log('  Transcript:', r.transcript?.slice(0, 80) || 'None')
    console.log('')
  })
}

main()
