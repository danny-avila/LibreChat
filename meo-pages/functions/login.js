export function onRequestGet({ request }) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL('/new', request.url).toString(),
      'Cache-Control': 'no-store',
    },
  });
}

export function onRequest() {
  return Response.json(
    { error: { code: 'method_not_allowed' } },
    { status: 405, headers: { 'Cache-Control': 'no-store' } },
  );
}
