import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizePhone, sendSms } from '@/lib/telnyx-sms'
import type { ProfileRole } from '@/types/database.types'
import { randomUUID } from 'crypto'

const PHONE_AUTH_EMAIL_DOMAIN = process.env.PHONE_AUTH_EMAIL_DOMAIN || 'phone.voicealchemyacademy.local'

export function getPhoneAuthEmail(phone: string): string {
  const digits = normalizePhone(phone).replace(/\D/g, '')
  return `phone.${digits}@${PHONE_AUTH_EMAIL_DOMAIN}`
}

function getRandomPassword(): string {
  return `${randomUUID()}Aa1!`
}

export function getAppUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    request.headers.get('origin') ||
    new URL(request.url).origin
  )
}

export function getSmsRedirectUrl(request: Request, next = '/dashboard?complete_profile=1'): string {
  const callbackUrl = new URL('/auth/callback', getAppUrl(request))
  callbackUrl.searchParams.set('sms', '1')
  callbackUrl.searchParams.set('next', next)
  return callbackUrl.toString()
}

export async function sendPhoneSignupLink(params: {
  request: Request
  phone: string
  role: ProfileRole
  next?: string
}): Promise<string> {
  const supabase = createSupabaseAdmin()
  const normalizedPhone = normalizePhone(params.phone)
  const redirectTo = getSmsRedirectUrl(params.request, params.next)

  let link: string | undefined
  let userId: string | undefined
  let authEmail = getPhoneAuthEmail(normalizedPhone)

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('phone', normalizedPhone)
    .maybeSingle()

  if (existingProfile?.id) {
    const { data: existingUser } = await supabase.auth.admin.getUserById(existingProfile.id)
    if (existingUser.user?.email) {
      authEmail = existingUser.user.email
      const magic = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: authEmail,
        options: {
          redirectTo,
        },
      })

      if (magic.error || !magic.data.properties?.action_link) {
        throw new Error(magic.error?.message || 'Could not create SMS link')
      }

      await sendSms({
        to: normalizedPhone,
        body: `Voice Alchemy Academy: tap to continue: ${magic.data.properties.action_link}`,
      })

      return normalizedPhone
    }
  }

  const signup = await supabase.auth.admin.generateLink({
    type: 'signup',
    email: authEmail,
    password: getRandomPassword(),
    options: {
      redirectTo,
      data: {
        phone: normalizedPhone,
        role: params.role,
        signup_method: 'sms',
        profile_incomplete: true,
      },
    },
  })

  if (signup.data.properties?.action_link) {
    link = signup.data.properties.action_link
    userId = signup.data.user?.id
  } else {
    const magic = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: {
        redirectTo,
      },
    })

    if (magic.error || !magic.data.properties?.action_link) {
      throw new Error(magic.error?.message || signup.error?.message || 'Could not create SMS link')
    }

    link = magic.data.properties.action_link
    userId = magic.data.user?.id
  }

  if (userId) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          role: params.role,
          phone: normalizedPhone,
        },
        { onConflict: 'id' }
      )

    if (profileError) {
      console.error('[Phone Auth] Failed to upsert profile:', profileError.message)
    }
  }

  await sendSms({
    to: normalizedPhone,
    body: `Voice Alchemy Academy: tap to continue: ${link}`,
  })

  return normalizedPhone
}
