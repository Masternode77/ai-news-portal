import { adminRouteAuthResult } from './src/lib/admin-route-auth.js';

function noindexHeaders(extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra,
  };
}

export default function middleware(request) {
  const result = adminRouteAuthResult(request.headers.get('authorization') || '', process.env);
  if (result.ok) return;

  if (result.status === 404) {
    return new Response('Not found', {
      status: 404,
      headers: noindexHeaders(),
    });
  }

  return new Response('Admin authentication required', {
    status: 401,
    headers: noindexHeaders({
      'WWW-Authenticate': 'Basic realm="Compute Current Admin"',
    }),
  });
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*'],
};
