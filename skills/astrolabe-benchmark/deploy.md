# Publishing the site

Read only when the user asks to put the page online. `astrolabe build` writes the site to `dist/site/` next to `benchmark.json`: static files with relative links, its font, a copy of `benchmark.json` and of the raw files, and a `.nojekyll`. It works from any folder of any host, so publishing is copying that folder; this file covers what is specific to doing it for a user.

## Contents

- Before anything
- Which case applies
- Case 1: Pages of a code host
- Case 2: a host that builds from the repository
- Case 3: a site that already exists
- After publishing
- When it goes wrong
- Rules

## Before anything

- **Publish only when asked.** Never push, change a repository setting or create an account on your own initiative. Write the files, then let the user commit, push and click.
- **Say what becomes public**, before the first publication: the page, `benchmark.json` and every raw file `build` lists as copied. Read the raw files for secrets and personal data (keys, tokens, emails, names, internal addresses) and report what you found. When the repository is private, say that the site will not be: Pages sites are public on most plans. Wait for the user's answer.
- **Nothing goes online from a file that fails `validate`.** `build` validates first and writes nothing on failure; never work around it.

## Which case applies

Look before asking: `.github/workflows/`, `.gitlab-ci.yml`, `netlify.toml`, `vercel.json`, `wrangler.jsonc` or `wrangler.toml`, a `CNAME` file, a documentation site (`docs/`, `mkdocs.yml`, `docusaurus.config.*`, `astro.config.*`). Propose the host they point to; ask only when nothing is found.

| Case | When | What you write |
| --- | --- | --- |
| 1. Pages of a code host | The repository is on GitHub or GitLab and has no site yet | A CI workflow that builds and publishes `dist/site/` on each push |
| 2. A host that builds from the repository | Netlify, Vercel or Cloudflare is already connected, or the user prefers one | The host's config file: the build command and the output folder |
| 3. A site that already exists | A documentation site, Pages already in use, a company server | A step that copies `dist/site/` into a sub-folder of what that site publishes |

A repository has one Pages site: if it already has one, this is case 3. Never replace an existing site; the benchmark goes in a sub-folder of it, at `<site>/benchmarks/<id>/`. Relative links make the sub-folder work as it is.

In every case the build runs on the host or in CI from the committed `benchmark.json` and raw files, so `dist/site/` stays out of git (add it to `.gitignore`) and the page never goes stale. Pin the version: `npx astrolabe-bench@<version>`, the version `astrolabe --version` prints, so a rebuild gives the same page until someone chooses to upgrade.

## Case 1: Pages of a code host

GitHub: write `.github/workflows/benchmark-site.yml`, with the version, the benchmark's path and the address filled in.

```yaml
name: Benchmark site
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx astrolabe-bench@<version> build benchmarks/<id>/benchmark.json --format site --url https://<owner>.github.io/<repository>/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: benchmarks/<id>/dist/site
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

The user's step: Settings → Pages → Build and deployment → Source: **GitHub Actions**. Built in CI, the page names the commit and links the workflow run.

GitLab: a job in `.gitlab-ci.yml` with the `pages` keyword:

```yaml
benchmark-site:
  image: node:22
  script:
    - npx astrolabe-bench@<version> build benchmarks/<id>/benchmark.json --format site
  pages:
    publish: benchmarks/<id>/dist/site
```

Several benchmarks: build each, copy each `dist/site/` to `<id>/` of one folder, and publish that folder. Without CI: build locally, copy `dist/site/` into `docs/`, commit it, and the user sets the Pages source to that branch and folder; say that it must be rebuilt and committed after every change.

## Case 2: a host that builds from the repository

Build command: `npx astrolabe-bench@<version> build benchmarks/<id>/benchmark.json --format site --url <address>`. Output folder: `benchmarks/<id>/dist/site`. Node 22 or later.

| Host | Config file | Node version |
| --- | --- | --- |
| Netlify | `netlify.toml`: `[build]` with `command` and `publish` | `NODE_VERSION = "22"` under `[build.environment]` |
| Vercel | `vercel.json`: `"buildCommand"`, `"outputDirectory"`, `"framework": null` | Settings → Build and Deployment → Node.js Version, or `engines.node` in `package.json` |
| Cloudflare | `wrangler.jsonc`: `"name"`, `"compatibility_date"`, `"assets": { "directory": "benchmarks/<id>/dist/site" }`; the build command goes in Settings → Build | `NODE_VERSION` build variable, or a `.node-version` file |

When the repository already has a config file for this host, add to it; never replace its settings. The user's step: connect the repository to the host, if it is not connected yet.

## Case 3: a site that already exists

Add a step to that site's own build, before it runs: build the benchmark, then copy `benchmarks/<id>/dist/site/` into the folder the site publishes as it is (`static/`, `public/`, `docs/`), under `benchmarks/<id>/`. Change nothing else of the site. For a server or object storage, the same copy goes to `<root>/benchmarks/<id>/`.

## After publishing

1. Open the address and check four things: the page loads with its styles, a filter changes its chart, an evidence link (`benchmark.json`, a raw file) opens, and the results hash on the page is the one `astrolabe validate` prints.
2. Once the address is known, put it in the build command with `--url`, so a shared link shows the preview image, and point the README card's link at the page.
3. Give the user the steps only they can do as a short numbered list, with the exact names of the settings.

## When it goes wrong

| Symptom | Likely cause |
| --- | --- |
| Page without styles | Only `index.html` was copied, or a host rewrote the paths: publish the whole folder as it is |
| 404 | The output folder is wrong, Pages is not turned on, or the address lacks its sub-folder |
| An old page | The host serves a committed copy, or the build failed: read the CI log, where `validate` names the rule |
| No preview image on a shared link | `--url` is missing or is not the exact public address |

## Rules

| Rule | Level | Instruction | How it is held |
| --- | --- | --- | --- |
| H1 | Must | Publish only when the user asks. Never push, change repository settings or create an account on your own initiative | This file; checked in the evaluations |
| H2 | Should | Look before asking: an existing workflow, host config file, custom-domain file or documentation site tells which case applies. Propose that host; ask only when nothing is found | This file |
| H3 | Must | Never replace a site that already exists. Publish in a sub-folder of it | This file; checked in the evaluations |
| H4 | Must | Before the first publication, tell the user what becomes public: the page, `benchmark.json` and the raw data files. Check the raw data for secrets and personal data, and say so when the repository is private | `build` lists the files it copies; the check is yours |
| H5 | Must | Nothing is published from a file that fails `validate` | `build` validates first and writes nothing on failure |
| H6 | Should | In CI, pin the version of the command (`npx astrolabe-bench@<version>`) | This file |
| H7 | Should | After publication, open the address and check four things: the page loads with its styles, a filter changes the chart, an evidence link opens, and the hash shown on the page is the one `validate` prints | This file |
| H8 | Should | Once the address is known, set `--url` in the build command and add the link to the README | `build` warns when `--url` is missing |
| H9 | Should | Give the user the steps only they can do as a short numbered list, with the exact names of the settings | This file |
