# BELLEZA

A static storefront for BELLEZA, built with HTML, CSS, and vanilla JavaScript.

## Local preview

Open `index.html` in a browser or serve the repository root with a local static file server. No build step or package installation is required.

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the storefront when changes are pushed to `main` or when the workflow is run manually. Enable GitHub Pages for the repository with **GitHub Actions** as the build and deployment source.

## Data and security

Product data is stored in Supabase and read by the public storefront. Product writes are protected by database row-level security; only users listed in `public.product_admins` can add, edit, or delete products. Wishlist and catalogue form records remain local to the current browser, and catalogue files are not uploaded or persisted.

All product prices are formatted in INR. Existing numeric prices are treated as rupees; they are not converted from USD.

## Product administration setup

1. Run `supabase/schema.sql` in the Supabase SQL Editor to create the product tables, row-level security policies, and initial product rows.
2. Create an admin user in Supabase Auth. In the SQL Editor, grant that user access by inserting their Auth user ID into `public.product_admins`, for example:

   ```sql
   insert into public.product_admins (user_id)
   select id from auth.users where email = 'admin@example.com';
   ```

3. Add the Supabase project URL and public anon key as GitHub Actions repository variables named `BELLEZA_SUPABASE_URL` and `BELLEZA_SUPABASE_ANON_KEY`. The Pages workflow embeds these public client settings during build. Never use a Supabase service-role key in the browser or repository.
4. Open `admin-products.html` and sign in with the authorized Supabase Auth account.

The admin page does not include a client-side password or decide admin access itself; Supabase Auth and row-level security enforce access. If the project variables are missing, the local preview falls back to default/local products and keeps admin actions disabled. Existing product edits in browser `localStorage` are not automatically migrated to Supabase.
