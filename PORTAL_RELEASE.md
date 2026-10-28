# Customer portal release status

The customer portal is implemented on the main website source in this branch, but it must not be merged to production yet. Supabase project `wfaqlfzrcvwgcfyhhymf` was restored from INACTIVE on 28 October 2026. The existing database remains in private beta (`pjd_settings.private_beta = true`).

The database was updated directly with authenticated-only INSERT column grants and owner-scoped RLS INSERT policies `pjd_aircraft_customer_insert` and `pjd_requests_customer_insert`. Existing SELECT RLS policies continue to use `pjd_private.can_read(owner_id)`. No anonymous INSERT/SELECT access was granted, and customers cannot write request status, admin notes, other owners' aircraft, or the outbox.

The page uses a public Supabase publishable key, not a server-side credential. The browser calls Auth and REST with the signed-in user's token. It supports registration, email confirmation return, sign in, session refresh, password reset, own aircraft registration, and own service requests. After saving a request, the browser calls the server-side `/api/portal-notify` function. That function verifies the Supabase token and reads only a request belonging to the authenticated user before using the existing Vercel Resend environment variables to notify the operator. Resend uses an idempotency key for a repeated request within its retention window. On mail failure, the request remains saved and the customer is told to contact the business directly. There is no durable retry worker yet.

Release prerequisites:

1. Custom SMTP was activated on 28 October. A signup and password reset email arrived at the connected business Gmail account. The Site URL and allow-listed redirect URL were then configured, and a second confirmation email was verified to redirect to `https://www.premiumjetdetailing.de/kundenportal`.
2. One confirmed test account signed in and wrote an aircraft and request. A different owner ID was rejected with HTTP 403. Test records and accounts were removed. A second independently confirmed account should still be used for a complete cross-owner read test.
3. Verify the operator notification end to end against the configured Vercel Resend destination. The notification route has been unit tested with a mocked provider, not with an actual outbound email. Review abuse protection such as CAPTCHA and rate limits before allowing self-service registration.
4. After those checks, set `pjd_settings.private_beta = false` and deploy the tested commit to the Vercel project `premium-jet-detailing-website-tcli`, which owns `www.premiumjetdetailing.de`.

The separate protected `premium-jet-portal-staging` project remains a design demo. Do not confuse it with this implementation or the live website.
