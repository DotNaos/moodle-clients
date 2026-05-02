# Mobile Authenticator Bridge

The Moodle mobile app can act as the trusted device for Moodle token exchange.
This avoids Moodle's same-IP QR restriction on hosted servers: the phone scans
the original Moodle Mobile QR code, receives the Moodle token locally, and later
shares that token with a web app only after the user approves a bridge request.

## Bridge QR Format

Any app that wants a Moodle login can display a QR code with the target origin,
completion endpoint, and one-time challenge.

Preferred format:

```text
moodleauth://bridge?origin=https%3A%2F%2Fmoodle.os-home.net&endpoint=https%3A%2F%2Fmoodle.os-home.net%2Fapi%2Fmobile%2Fbridge%2Fcomplete&challenge=<one-time-challenge>&state=<opaque-state>&app=Moodle%20Web
```

HTTPS web fallback:

```text
https://moodle.os-home.net/mobile-bridge?endpoint=https%3A%2F%2Fmoodle.os-home.net%2Fapi%2Fmobile%2Fbridge%2Fcomplete&challenge=<one-time-challenge>&state=<opaque-state>&app=Moodle%20Web
```

Legacy format remains supported while old clients exist:

```text
moodlereadonlyproxy://pair?server=https%3A%2F%2Fmoodle.os-home.net&pairId=<one-time-challenge>
```

## Mobile Flow

1. The user scans the original Moodle Mobile QR code in the Moodle mobile app.
2. The phone exchanges the QR code with Moodle from the phone network path and
   stores the Moodle token locally.
3. A web app or another client displays a bridge QR with its own endpoint.
4. The phone scans the bridge QR and shows the target app/origin.
5. The user approves sharing.
6. The phone posts the Moodle token to the endpoint from the QR code.

## Completion Request

The mobile app sends:

```json
{
  "challenge": "<one-time-challenge>",
  "pairId": "<legacy-compatible-challenge>",
  "state": "<opaque-state>",
  "origin": "https://moodle.os-home.net",
  "moodleSiteUrl": "https://moodle.fhgr.ch",
  "moodleUserId": 12345,
  "moodleMobileToken": "<secret-token>",
  "source": "moodle-clients-mobile"
}
```

The receiving server must validate the one-time challenge, bind the Moodle
session to the currently signed-in user, then invalidate the challenge.

## Security Rules

- The mobile app has no hardcoded server URL for bridge targets.
- The bridge endpoint must use HTTPS, except localhost development URLs.
- The app displays the target before sending the Moodle token.
- Challenges must be single-use and short-lived on the server.
- Tokens must never be placed in query strings or logs.
