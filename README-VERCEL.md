# Vercel Deployment Guide

This project is ready to deploy as a static frontend on Vercel.

## Files Used

- `index.html`
- `styles.css`
- `src/main.js`
- `vercel.json`

## Deploy Steps

1. Create a new GitHub repository.
2. Upload this full project folder to the repository.
3. Go to [https://vercel.com](https://vercel.com).
4. Sign in with GitHub.
5. Click `Add New Project`.
6. Import your GitHub repository.
7. Vercel should detect it as a static project.
8. Keep the default settings.
9. Click `Deploy`.

## Expected Result

After deployment, Vercel will give you a public URL like:

`https://your-project-name.vercel.app`

Anyone with that link can open the app in their browser.

## Backend Route

This project now includes a serverless endpoint:

- `api/fetch-product.js`

The frontend will call this Vercel API first for product and ASIN title fetching.
That means title extraction should be more reliable after deployment than when opening the app directly with `file:///`.

## Important Note

This app currently uses browser-side fetches and public proxy endpoints for live product/ASIN extraction.
That means:

- it can work online
- but Amazon/product fetching may still be inconsistent sometimes
- if you want more reliable real-time product data later, add a small backend/serverless function on Vercel

## Recommended Next Upgrade

If you want stronger reliability later, the next step is:

- keep this frontend on Vercel
- add Vercel Functions for product-page fetching and parsing
