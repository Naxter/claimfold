# Instagram live canary

Run this once per deployment or Meta app/account change before scheduling a real
post. It validates the two things the dashboard cannot observe from inside the
installation: Meta reaching the public host and Instagram accepting a real
carousel.

Use a dedicated professional **test account**. Do not use a client or production
account for this run.

## Before the test

1. Open **Settings → Before you can publish**. All four checks must be green:
   a public HTTPS `APP_URL`, a public HTTPS `PUBLIC_ASSET_URL`, a connected
   Instagram account, and a healthy token.
2. In the Meta app, confirm the exact callback, deauthorize and data-deletion
   URLs shown by **Set up publishing** are registered. Meta compares the
   callback literally.
3. Confirm the web container and the worker are both running. The worker is
   what publishes scheduled posts.
4. Create a deliberately harmless carousel in the test channel. Give every
   slide alt text, let the ordinary review gate run, and approve it as the
   named reviewer. Use a unique caption such as `Claimfold canary YYYY-MM-DD`.

## Run it

1. Publish the approved test carousel immediately (do not schedule the first
   canary). Record the post id, time, active workspace and `@username`.
2. In Instagram, confirm the carousel appears on the **test** account with all
   slides, the caption and the expected order. Open it on a phone as well as a
   desktop browser if possible; slide cropping is an Instagram-side behaviour.
3. Confirm the dashboard records `published`, the Instagram permalink, the
   destination account and the named approver.
4. Leave the worker running until the first insights poll completes. Confirm the
   measured timestamp and whatever non-zero metrics Instagram has made
   available. A new post may legitimately have zeros; the proof is that the
   poll completed without an authentication or media-fetch error.

## Pass / fail

**Pass:** the published carousel is complete on the intended test account, the
dashboard records the correct destination and approver, and the first insights
poll completes.

**Fail:** stop before scheduling real posts. Keep the failed post, worker log
and dashboard error as the incident record. Check, in this order:

1. `APP_URL` and `PUBLIC_ASSET_URL` are public HTTPS addresses, not localhost,
   a private IP or a VPN-only hostname.
2. The exact Meta redirect and callback configuration matches the wizard.
3. The connected account is the intended professional test account and its
   token is healthy.
4. Each rendered image URL opens unauthenticated from a network outside the
   host. Do not replace it with a presigned or expiring URL; Meta fetches the
   images server-to-server.
5. The worker has the same environment and storage mount as the web process.

Delete the test post only after its result has been recorded. A canary that is
not documented is difficult to distinguish from a real first publication later.
