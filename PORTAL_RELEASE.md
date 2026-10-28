# Customer portal release status

The customer portal is implemented on the main website source in this branch, but it must not be merged to production yet. Supabase project `wfaqlfzrcvwgcfyhhymf` was restored from INACTIVE on 28 October 2026. The existing database remains in private beta (`pjd_settings.private_beta = true`).

The database was updated directly with authenticated-only INSERT column grants and owner-scoped RLS INSERT policies `pjd_aircraft_customer_insert` and `pjd_requests_customer_insert`. Existing SELECT RLS policies continue to use `pjd_private.can_read(owner_id)`. No anonymous INSERT/SELECT access was granted, and customers cannot write request status, admin notes, other owners' aircraft, or the outbox.

The page uses a public Supabase publishable key, not a server-side credential. The browser calls Auth and REST with the signed-in user's token. It supports registration, email confirmation return, sign in, session refresh, password reset, own aircraft registration, and own service requests. Request submissions currently create database records but do not deliver an email to the operator. No end-to-end customer account test has been performed.

Release prerequisites:

1. Configure and test custom SMTP for Supabase Auth; its default SMTP is restricted to project team email addresses and is unsuitable for public registration.
2. Allow `https://www.premiumjetdetailing.de/kundenportal` in Supabase Auth redirect URLs and set an appropriate Site URL. Check email confirmation is enabled.
3. Configure abuse protection such as CAPTCHA and review email rate limits.
4. Provide an operator workflow to see incoming portal requests and notify the operator reliably. The existing outbox mail sender from the earlier local prototype was not recovered; this branch does not send request email.
5. Test two actual confirmed customer accounts to verify owner isolation, signup, sign-in, password reset, aircraft registration and service requests, including on the mobile layout.
6. After those tests, set `pjd_settings.private_beta = false` and deploy the tested commit to the Vercel project `premium-jet-detailing-website-tcli`, which owns `www.premiumjetdetailing.de`.

The separate protected `premium-jet-portal-staging` project remains a design demo. Do not confuse it with this implementation or the live website.
