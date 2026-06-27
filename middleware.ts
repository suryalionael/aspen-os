import { type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // robots.txt/sitemap.xml are crawler-facing and must never hit auth
    // logic — confirmed directly via Lighthouse: without this exclusion,
    // an unauthenticated request to /robots.txt got redirected to
    // /sign-in (it wasn't in PUBLIC_PATHS), so crawlers saw a redirect
    // instead of the file, failing the "robots.txt is valid" SEO audit.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
