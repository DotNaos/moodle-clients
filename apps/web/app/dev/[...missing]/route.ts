export function GET() {
  return new Response("Not Found", { status: 404 });
}

export function HEAD() {
  return new Response(null, { status: 404 });
}
