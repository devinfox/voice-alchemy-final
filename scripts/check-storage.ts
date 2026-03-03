import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
  // List all folders in the bucket
  const { data: folders, error: foldersError } = await supabase
    .storage
    .from('lesson-recordings')
    .list('', { limit: 20 })

  if (foldersError) {
    console.error('Folders error:', foldersError)
    return
  }

  console.log('Storage folders:')

  for (const folder of folders || []) {
    if (folder.id) {
      // This is a folder, list its contents
      const { data: files, error: filesError } = await supabase
        .storage
        .from('lesson-recordings')
        .list(folder.name, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } })

      console.log(`\nFolder: ${folder.name}`)
      if (filesError) {
        console.log('  Error:', filesError.message)
      } else {
        files?.forEach(f => {
          const createdAt = f.created_at ? new Date(f.created_at) : null
          console.log(`  - ${f.name}`)
          console.log(`    Size: ${f.metadata?.size || 'unknown'} bytes`)
          console.log(`    Created: ${createdAt?.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) || 'unknown'}`)
        })
      }
    }
  }

  // Also check for any recent booking/relationship
  console.log('\n\nRecent bookings with recordings:')
  const { data: bookings, error: bookingsError } = await supabase
    .from('lesson_recordings')
    .select('booking_id, id, started_at, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!bookingsError && bookings) {
    const uniqueBookings = [...new Set(bookings.map(b => b.booking_id))]
    console.log('Unique booking IDs:', uniqueBookings)
  }
}

main()
