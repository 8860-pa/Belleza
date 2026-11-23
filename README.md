# BELLEZA

A static storefront for BELLEZA, built with HTML, CSS, and vanilla JavaScript.

## Local preview

Open `index.html` in a browser or serve the repository root with a local static file server. No build step or package installation is required.

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the storefront when changes are pushed to `main` or when the workflow is run manually. Enable GitHub Pages for the repository with **GitHub Actions** as the build and deployment source.

## Data and security

The product manager, wishlist, and catalogue form store data in the current browser's `localStorage`; they are not shared across devices and are not protected by server-side authentication. Catalogue files are not uploaded or persisted. A secure backend and file-storage service are needed for shared administration, real file uploads, or checkout.
