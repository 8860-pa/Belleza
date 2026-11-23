# BELLEZA

A static storefront for BELLEZA, built with HTML, CSS, and vanilla JavaScript.

## Local preview

Open `index.html` in a browser or serve the repository root with a local static file server. No build step or package installation is required.

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the storefront when changes are pushed to `main` or when the workflow is run manually. Enable GitHub Pages for the repository with **GitHub Actions** as the build and deployment source.

## Data and security

Product data is stored in Supabase and read by the public storefront. Product writes are protected by database row-level security; only users listed in `public.product_admins` can add, edit, or delete products. Wishlists remain local to the current browser. Vendor catalogue metadata is stored in Supabase, and uploaded files are kept in a private Storage bucket.

All product prices are formatted in INR. Existing numeric prices are treated as rupees; they are not converted from USD.

## Supabase setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor. This creates product and catalogue tables, row-level security policies, the private catalogue-file bucket, and initial product rows.
2. The public project URL and publishable key are configured in `supabase-config.js` for local preview. The Pages workflow takes the same public settings from GitHub Actions repository variables named `BELLEZA_SUPABASE_URL` and `BELLEZA_SUPABASE_PUBLISHABLE_KEY`. Publishable keys are intended for browser use with RLS enabled; never use a Supabase secret/service-role key in the browser or repository.
3. Configure Supabase Auth's site URL and redirect allowlist to include the deployed GitHub Pages URL so vendor email confirmation can return to the catalogue page.
4. Create an admin user in Supabase Auth. In the SQL Editor, grant that user access by inserting their Auth user ID into `public.product_admins`, for example:

   ```sql
   insert into public.product_admins (user_id)
   select id from auth.users where email = 'admin@example.com';
   ```

5. Open `admin-products.html` and sign in with the authorized admin account. The Products tab manages storefront items; Catalogue submissions lists vendor uploads and creates short-lived download links for the private files.
6. Vendors can create an account or sign in at `catalogue-upload.html`, then submit PDF, JPG, PNG, or ZIP files up to 20 MB each. Supabase stores submissions and files; vendors can only upload to their own storage folder, and only admins can view all submissions.
7. Sellers can sign in at `seller-panel.html` to view their own submissions and open short-lived links to their private catalogue files. The panel relies on the existing authenticated-user RLS policies and does not expose other sellers' submissions.

The admin page does not include a client-side password or decide admin access itself; Supabase Auth and row-level security enforce access. If the project variables are missing, the local preview falls back to default products while admin actions and vendor uploads remain disabled. Existing product edits in browser `localStorage` are not automatically migrated to Supabase.
