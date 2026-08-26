import type { NextRequest } from "next/server";

import { refreshAdminSession } from "@/delivery/auth/refresh-session";

export async function proxy(request: NextRequest) {
  return refreshAdminSession(request);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
