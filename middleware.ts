import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessEmailTools } from '@/lib/email-access'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isEmailDashboardRoute = pathname.startsWith('/dashboard/email') ||
                                pathname.startsWith('/dashboard/email-templates')
  const isEmailApiRoute = pathname.startsWith('/api/email') ||
                          pathname.startsWith('/api/email-templates')
  const isEmailWebhookRoute = pathname.startsWith('/api/email/webhooks/')

  if (user && (isEmailDashboardRoute || (isEmailApiRoute && !isEmailWebhookRoute))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, name, role')
      .eq('id', user.id)
      .maybeSingle()

    if (!canAccessEmailTools(profile, user.email)) {
      if (isEmailApiRoute) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // Define protected and auth routes
  const isAuthRoute = pathname.startsWith('/login') ||
                      pathname.startsWith('/signup') ||
                      pathname.startsWith('/forgot-password') ||
                      pathname.startsWith('/reset-password') ||
                      pathname.startsWith('/auth/callback')
  const isProtectedRoute = !isAuthRoute &&
                           !pathname.startsWith('/api') &&
                           pathname !== '/'

  // Redirect unauthenticated users to login
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages (except reset-password which needs auth)
  // Allow ?switch=true to bypass for account switching in dev mode
  const isResetPassword = pathname.startsWith('/reset-password')
  const isSwitchingAccounts = request.nextUrl.searchParams.get('switch') === 'true'
  if (user && isAuthRoute && !isResetPassword && !isSwitchingAccounts) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - api/auth routes (OAuth callbacks)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
