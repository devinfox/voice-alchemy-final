import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// Signup-confirmation links land here. Supabase sends `type=email` for the
// confirm-signup template and `type=signup` for the older link format.
const SIGNUP_TYPES: EmailOtpType[] = ['email', 'signup']

function getSafeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard'
  }

  return value
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = getSafeNext(searchParams.get('next'))

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  )

  // Handle OAuth code flow
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      // Google signups pass the role picked on /signup; apply it to the
      // profile the on_auth_user_created trigger just made (defaults to
      // student). Plain logins never carry this param.
      const roleParam = searchParams.get('role')
      if (roleParam === 'student' || roleParam === 'teacher') {
        await supabase
          .from('profiles')
          .update({ role: roleParam })
          .eq('id', data.session.user.id)
      }

      // Check if this is a password recovery flow by looking at the session's aal
      // For password recovery, Supabase sets a specific auth event
      // We can also check if the user came from a recovery email by checking the session
      const isRecovery = data.session.user?.recovery_sent_at &&
        (Date.now() - new Date(data.session.user.recovery_sent_at).getTime() < 3600000) // Within last hour

      if (isRecovery || next === '/reset-password') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Handle magic link / OTP token flow (email confirmation, recovery, dev login)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    })

    if (!error) {
      // For recovery type, redirect to reset-password
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }

      // Email is now confirmed. Don't silently sign the user in from an email
      // click — the link may be opened on a different device than the one they
      // signed up on (and forwarded emails shouldn't hand out sessions).
      // Drop the session verifyOtp just created and send them to sign in.
      if (SIGNUP_TYPES.includes(type)) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?confirmed=1`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    } else {
      console.error('[Auth Callback] OTP verification error:', error)

      if (SIGNUP_TYPES.includes(type)) {
        return NextResponse.redirect(`${origin}/login?confirmed=expired`)
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
