import { NextResponse } from "next/server";

const CLERK_COOKIES = ["__session", "__client_uat", "__clerk_db_jwt", "__clerk_redirect_url"] as const;

function clerkCookieNames(cookieHeader: string | null): string[] {
  const fromRequest = !cookieHeader
    ? []
    : cookieHeader
        .split(";")
        .map((part) => part.trim().split("=")[0])
        .filter((name) => name.startsWith("__clerk") || name === "__session" || name === "__client_uat");

  return [...new Set([...CLERK_COOKIES, ...fromRequest])];
}

function redirectOrigin(request: Request): string {
  const portlessUrl = process.env.PORTLESS_URL;
  if (portlessUrl) {
    return portlessUrl.replace(/\/$/, "");
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host || host.startsWith("0.0.0.0")) {
    return "http://moodle.localhost:1355";
  }

  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not found", { status: 404 });
  }

  const homeUrl = new URL("/", redirectOrigin(request)).toString();
  const response = new NextResponse(
    `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Clerk Session zurücksetzen</title>
    <meta http-equiv="refresh" content="1;url=${homeUrl}" />
  </head>
  <body>
    <p>Alte Clerk-Session wird gelöscht …</p>
    <p><a href="${homeUrl}">Weiter zur Startseite</a></p>
    <script>
      localStorage.clear();
      sessionStorage.clear();
      setTimeout(function () { window.location.replace(${JSON.stringify(homeUrl)}); }, 800);
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Clear-Site-Data": '"cookies", "storage"',
      },
    },
  );

  for (const name of clerkCookieNames(request.headers.get("cookie"))) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
    response.cookies.set(name, "", {
      path: "/",
      domain: "moodle.localhost",
      maxAge: 0,
      expires: new Date(0),
    });
  }

  return response;
}
