# BELLEZA

A static storefront for BELLEZA, built with HTML, CSS, and vanilla JavaScript.

## Local preview

Open `index.html` in a browser or serve the repository root with a local static file server. No build step or package installation is required.

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the storefront when changes are pushed to `main` or when the workflow is run manually. Enable GitHub Pages for the repository with **GitHub Actions** as the build and deployment source.

## Data and security

Product data is stored in Supabase and read by the public storefront. Product writes are protected by database row-level security; only users listed in `public.product_admins` can manage products. Vendors can submit catalogue details and product listings through the authenticated catalogue form; submitted products appear on the storefront immediately. Product photos are stored in a public image bucket and shown as a gallery. Supporting catalogue files remain in a private Storage bucket.

All product prices are formatted in INR. Existing numeric prices are treated as rupees; they are not converted from USD.

## Supabase setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor. This creates product, catalogue, and order tables, row-level security policies, public product-image and private catalogue-file buckets, the checkout order RPC, and the catalogue/product submission RPC. For an existing project, run `supabase/migrations/20261124_catalogue_products_and_galleries.sql` to add product galleries and connect catalogue submissions to storefront listings.
2. The public project URL and publishable key are configured in `supabase-config.js` for local preview. The Pages workflow takes the same public settings from GitHub Actions repository variables named `BELLEZA_SUPABASE_URL` and `BELLEZA_SUPABASE_PUBLISHABLE_KEY`. Publishable keys are intended for browser use with RLS enabled; never use a Supabase secret/service-role key in the browser or repository.
3. Configure Supabase Auth's site URL and redirect allowlist to include the deployed GitHub Pages URL so vendor email confirmation can return to the catalogue page.
4. Create an admin user in Supabase Auth. In the SQL Editor, grant that user access by inserting their Auth user ID into `public.product_admins`, for example:

   ```sql
   insert into public.product_admins (user_id)
   select id from auth.users where email = 'admin@example.com';
   ```

5. Open `admin-products.html` and sign in with the authorized admin account. The Products tab manages storefront items and photo galleries; Catalogue submissions lists vendor uploads and creates short-lived download links for private files; Orders shows delivery details and lets admins update order and payment status.
6. Vendors can create an account or sign in at `catalogue-upload.html`, add one or more products with up to eight JPG, PNG, or WebP photos each, and optionally attach supporting catalogue files. A single submission saves the catalogue and its products together; the products are immediately visible in the store. Product photos are limited to 10 MB each, while supporting files are limited to 20 MB each. Vendors can only upload to their own storage folders.
7. Sellers can sign in at `seller-panel.html` to view their own submissions and open short-lived links to their private catalogue files. The panel relies on the existing authenticated-user RLS policies and does not expose other sellers' submissions.

## Checkout and payments

Customers can open checkout from the cart, provide delivery and contact details, and place a cash-on-delivery order. The database recalculates the item subtotal from current product prices; delivery charges are confirmed separately and paid on delivery. Order addresses and contact details are visible only to product admins.

Razorpay Checkout support is implemented for UPI, cards, and netbanking. Online payments remain unavailable until the merchant account, Edge Function secrets, and deployed functions are configured. The storefront never receives the Razorpay secret or handles card details. Before online payments can work:

1. Create and verify a BELLEZA merchant account with Razorpay. Start with **test-mode** API keys.
2. In Supabase Dashboard, open **Edge Function Secrets** and add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. Do not put these values in GitHub variables, HTML, or JavaScript.
3. Apply the updated `supabase/schema.sql` to add Razorpay order/payment columns and statuses.
4. Install and authenticate the Supabase CLI, link this project with `supabase link --project-ref llpnlcylyoabyeyzpmok`, then deploy `razorpay-create-order`, `razorpay-verify-payment`, and `razorpay-webhook` with `supabase functions deploy <function-name>`.
5. In Razorpay Dashboard, register `https://llpnlcylyoabyeyzpmok.supabase.co/functions/v1/razorpay-webhook` as a webhook for `payment.captured`, using the same webhook secret.
6. Make a test-mode payment and confirm it appears in the Admin **Orders** tab before switching to live keys after Razorpay approves the merchant account.

The Edge Functions calculate prices on the server, verify Razorpay's payment signature and captured amount, and process signed payment webhooks. Their public checkout endpoints accept requests only from the configured GitHub Pages and local preview origins. Delivery charges are not part of the Razorpay amount; the customer pays the confirmed delivery charge separately on delivery.

The admin page does not include a client-side password or decide admin access itself; Supabase Auth and row-level security enforce access. If the project variables are missing, the local preview falls back to default products while admin actions and vendor uploads remain disabled. Existing product edits in browser `localStorage` are not automatically migrated to Supabase.
