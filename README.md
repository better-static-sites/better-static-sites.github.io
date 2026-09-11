# Better Static Sites

A standard library of common tools and components you might need to build a nice static site.

Does this suite contain the best tools around? I can't answer that question. But they're certainly _better_ than something.

## This repo

This is the documentation site for the `astro-better-*` package family. It is built with Astro 7
and uses the packages it documents (sidebar, nav bar, steps, tabs, admonitions, TOC, etc.) in
its own layout.

## Local development

The packages are referenced as local `file:` dependencies. All packages must exist in sibling
directories at `~/Documents/astro-better-*` (and related). Clone the repos before running the
docs site.

Some packages have their own dependencies that Node resolves from the source directory when
loaded via `file:` paths. If you add a new local package dependency, run `npm install` inside
that package's directory in addition to running it here.

```sh
# install deps (including all local file: packages)
npm install

# start dev server at http://localhost:4321/bss-docs
npm run dev

# production build to dist/
npm run build

# preview the production build locally
npm run preview
```

The dev server picks up changes to the local packages immediately because they are symlinked
into `node_modules`.

## Production build

```sh
npm run build
```

Output goes to `dist/`. The site is built with `base: '/bss-docs'` so all asset paths are
prefixed accordingly. The `astro-gen-markdown-pages` integration also writes `.md` companion
files and `dist/llms.txt` at build time.

## Deployment

The site deploys to GitHub Pages automatically on every push to `main` via
`.github/workflows/deploy.yml`. The workflow:

1. Checks out the repo and installs Node (version from `.nvmrc`)
2. Runs `npm ci` to install deps
3. Runs `npm run build` to produce `dist/`
4. Uploads `dist/` as a Pages artifact and deploys it

To enable this for a new repo:

1. Go to Settings > Pages > Source and set it to "GitHub Actions"
2. Push to `main` -- the workflow triggers automatically

The deployed URL will be `https://<org>.github.io/bss-docs/` (matching the `base` config).
