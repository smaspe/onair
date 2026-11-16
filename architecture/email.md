# Email

A note, not a plan. The app sends no email today.

## What the app asks Supabase to send

The client calls `signInWithPassword`, `signUp` and `signOut`, and nothing else. Only `signUp`
can produce a message, and only when the project asks for email confirmation. The project does
not ask for it, so a new account is usable at once and no message leaves Supabase.

The project answers what it does at `GET /auth/v1/settings`, with the publishable key as the
`apikey` header. `mailer_autoconfirm` is the field to read: when it is true, sign-up confirms the
address itself and sends nothing. `supabase/config.toml` states the same thing for a local stack
and says nothing about the hosted project.

A password reset is the first feature that needs a message. See [the TODO](../TODO.md).

## The two limits Supabase applies

Supabase applies a limit of its own before a provider sees the message. The limit depends on
whether the project has a custom SMTP server.

| | Messages per hour | Recipients | Adjustable |
| --- | --- | --- | --- |
| The built-in service | 2 | Members of the project's organization only | No |
| A custom SMTP server | 30 | Anybody | Yes, on the Rate Limits page |

The recipient rule is the one that matters. Supabase states it as: "Unless you configure a
custom SMTP server for your project, Supabase Auth will refuse to deliver messages to addresses
that are not part of the project's team." A person who signs up with their own address gets
nothing.

Supabase also says the built-in service is "not meant for production use", gives "best-effort
only" delivery, and carries no SLA. The 2-per-hour figure "can change without notice".

So the built-in service cannot serve any real user, at any volume. There is no stage of growth
where it is sufficient and a provider is an upgrade. The first message the app sends needs a
provider already configured.

Sources: [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[Production checklist](https://supabase.com/docs/guides/platform/going-into-prod).

## Three volumes to plan for

**A few dozen users.** A burst of two messages per minute is 120 per hour. This is below every
provider's allowance and above the 30 per hour that Supabase applies to a project with a custom
SMTP server. Raise that number on the Rate Limits page.

**A large arrival.** Thousands of people read about the app in one day.

**A settled pace.** Unknown, and smaller than the arrival.

The first and the third ask nothing of a provider. The second decides the choice.

## The arrival sends fewer messages than it looks

A large arrival is a sign-up peak. Sign-up sends no message while confirmation stays off, so the
peak itself costs nothing.

Password resets do not follow the traffic. A person asks for a reset when they come back and
cannot remember the password, which is weeks after they signed up. A large arrival therefore
raises the steady rate of resets long after the day it happened, and it raises it in proportion
to how many of those accounts survive.

Turning confirmation on changes this. Confirmation puts one message in front of every sign-up,
which moves the whole peak onto the provider and onto the Supabase rate limit.

## What the free tiers allow

| | Free allowance | The binding limit |
| --- | --- | --- |
| [Resend](https://resend.com/pricing) | 3,000 per month, 3 domains | 100 per day |
| [Brevo](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) | 300 per day, no expiry, no card | 300 per day |
| [Amazon SES](https://aws.amazon.com/ses/pricing/) | None that lasts | $0.10 per 1,000 |

A daily cap binds before a monthly allowance does. Resend's free plan allows 3,000 messages in a
month but only 100 in a day, so a single busy day uses 3% of the month and stops.

Brevo holds up to 1,000 transactional messages in a retry queue after the daily cap, and drops
what comes after that.

SES prices each message instead of capping the count. A day that sends 2,000 messages costs 20
cents.

## The failure mode decides this, not the price

A provider that reaches a cap drops the message. The message is a password reset, so the person
who does not get it cannot sign in, and they find out at the moment the app has their attention.
A provider that charges per message sends it and adds a fraction of a cent to a bill.

## SES holds new accounts back

A new SES account is in a sandbox, and the sandbox restricts it in the same way as Supabase's
built-in service:

- 200 messages per 24 hours.
- 1 message per second.
- Verified addresses only.

AWS Support answers a request for production access within 24 hours. This is a setup step with a
wait in it, so it has to be complete before the app needs it, not on the day.

## Every provider needs a domain, and the app does not have one

Gmail and Yahoo require a sender to authenticate their domain. The rule applies from 1 February
2024, and Microsoft stated the same requirement on 5 May 2025. A provider signs the message for
the domain in the from address, which means the sender has to control the DNS of that domain.

The app runs on `onair.smaspe.workers.dev`. Cloudflare owns `workers.dev` and gives out names
under it, so there is no zone to put a record in. **A domain is the first thing to buy, and
nothing else about email can start until it exists.**

This applies to Brevo and to SES alike.

## Steps to send through Brevo

1. **Register a domain, and hold its DNS somewhere you can edit.** Cloudflare already serves the
   app, so its DNS is one account fewer.
2. **Point the app at the domain.** A reset link has to land on the app, so `site_url` in
   `supabase/config.toml` and the Supabase dashboard both name the new address. A Worker takes a
   custom domain in its own settings.
3. **Create the Brevo account.** The free plan asks for no card and does not expire.
4. **Authenticate the domain in Brevo.** Brevo asks for three TXT records: a Brevo code that
   proves the domain is yours, a DKIM record that signs the messages, and a DMARC record with a
   `rua` tag. Brevo can write them itself if it recognises the DNS provider.
5. **Create an SMTP key**, at Brevo's SMTP and API settings. It is not an API key, and the two
   are not interchangeable. The matching login is either the account address or a generated
   `[id]@smtp-brevo.com` address, which Brevo shows beside the key.
6. **Fill in Supabase's SMTP settings**, on the project's Authentication SMTP page: sender
   address `no-reply@<the domain>`, a sender name, host `smtp-relay.brevo.com`, port 587,
   the SMTP login as the user, and the SMTP key as the password.
7. **Raise the Supabase rate limit.** Saving SMTP settings sets it to 30 messages per hour. The
   Rate Limits page changes it.
8. **Decide about confirmation at sign-up.** It is off. Turning it on puts one message in front
   of every sign-up.
9. **Build the reset flow.** It is the reason for all of the above, and it needs a page for the
   link to land on. The app is one page and has no router.
10. **Send one message to an address outside the Brevo account and the Supabase organization**,
    and read Brevo's transactional log to see what happened to it.

Two things to read off the account rather than the documentation: whether Brevo adds its own
mark to a transactional message on the free plan, and what the log says about the 300-per-day
cap once the retry queue is in use.

## What is undecided

- Which provider. Both need the domain, so the choice is between a cap that drops messages and a
  bill of about $0.10 per 1,000. SES also holds a new account in its sandbox for up to a day.
- Whether email confirmation goes on. It is off, and turning it on creates the peak that this
  document is about.
- What the Supabase rate limit should be. The default of 30 per hour is below the stated burst
  of two per minute.
