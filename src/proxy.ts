import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, verifyGateCookie } from "@/lib/gate";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|gate|api/auth/gate).*)"],
};

export async function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    return new NextResponse("DEMO_PASSWORD not configured on server", {
      status: 503,
    });
  }

  const cookie = request.cookies.get(GATE_COOKIE)?.value;
  const ok = await verifyGateCookie(cookie, password);
  if (ok) return NextResponse.next();

  const gateUrl = new URL("/gate", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next && next !== "/") gateUrl.searchParams.set("next", next);
  return NextResponse.redirect(gateUrl);
}
