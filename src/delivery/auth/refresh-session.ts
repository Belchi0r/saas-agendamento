import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createRequestScopedAuthClient,
  type AuthCookie,
} from "@/infrastructure/auth/server-client";

import { applyAuthenticatedCachePolicy } from "../http/cache-policy";

export async function refreshAdminSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const client = createRequestScopedAuthClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet: ReadonlyArray<AuthCookie>) => {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }

      response = NextResponse.next({ request });

      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  });

  // getClaims() validates and refreshes the SSR token when needed. Domain
  // authorization still uses getUser() plus Business.admin_auth_user_id.
  await client.auth.getClaims();
  applyAuthenticatedCachePolicy(response.headers);

  return response;
}
