import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type CompleteProfileRequest = {
  firstName?: string
  lastName?: string
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: CompleteProfileRequest

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid profile request' }, { status: 400 })
  }

  const firstName = cleanText(body.firstName)
  const lastName = cleanText(body.lastName)

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name are required' }, { status: 400 })
  }

  const fullName = `${firstName} ${lastName}`.trim()
  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
      name: fullName,
    })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
