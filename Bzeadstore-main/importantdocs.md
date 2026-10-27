# Important deployment and payment notes

Last updated: 2026-10-27

## Storefronts and deployment

The business operates four regional storefronts. They share one Supabase backend,
but each storefront has its own GitHub repository and hosting target:

| Repository | Storefront | Primary market | Hosting |
| --- | --- | --- | --- |
| `coreappcode/bz-india` | `www.bzead.in` | India | AWS |
| `coreappcode/bz-maldives` | `www.bzead.asia` | Maldives | AWS |
| `coreappcode/bz-uk` | `www.bzead.uk` | United Kingdom | AWS |
| `coreappcode/bz` | `www.bzead.com` | All other countries | Cloudflare |

On all four storefronts, the **Become a Seller** button should navigate to
`https://www.bzead.com/seller`.

All four storefronts use the same Supabase project. The project reference observed
while connecting the Supabase CLI is `aiiefgjfftmerayihpbv`.

When investigating or changing a behavior, check which storefront repository and
deployment target are in scope. A code finding in one storefront does not
automatically describe the other storefronts. A change to a shared Supabase
function or database can affect all four storefronts.

## Payment integration findings

- The intended provider split across storefronts is:

  | Storefront | Payment gateway |
  | --- | --- |
  | `www.bzead.in` | Razorpay |
  | `www.bzead.asia` | Stripe |
  | `www.bzead.uk` | Stripe |
  | `www.bzead.com` | Stripe |

- The shared Supabase project has active `create-razorpay-order` and
  `razorpay-webhook` Edge Functions, and Razorpay-related configuration and
  database fields. The order function creates authenticated INR orders; the
  webhook verifies signatures and processes payment settlement.
- The `coreappcode/bz` checkout source inspected in this workspace uses Stripe.
  Its checkout creates Stripe PaymentIntents and renders Stripe's Payment
  Element. Razorpay functions existing in the shared backend does not, by itself,
  mean this storefront calls them.
- The provider split above is the deployment requirement supplied by the
  project owner. The other three storefront checkouts were not inspected as part
  of that investigation; inspect each regional repository before changing or
  validating its frontend integration.
- A local change was made in `coreappcode/bz` to explicitly restrict newly
  created PaymentIntents to `card`, including the shared Edge Function's
  request path. That change was **not deployed** during the investigation.
  Deployment of the shared `create-payment-intent` function affects every
  storefront that calls it, so confirm the intended cross-store behavior before
  deploying.

## Operational guidance

- Keep credentials and secret values out of this document, source control, and
  chat. Configure secrets through the appropriate secret manager or CLI prompt.
- Treat live payment settings and webhook behavior as production-impacting.
  Verify the target storefront, payment provider, and deployment target before
  making changes.
- Keep deployed Supabase Edge Function source synchronized with its checked-in
  source where possible. During the investigation, Razorpay functions were
  deployed in Supabase but were not present in the `bz` checkout repository's
  local `supabase/functions` directory.
