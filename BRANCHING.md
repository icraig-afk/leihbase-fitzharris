# Branching for this fork

How to add features to this fork of
[leihbase/leihbase](https://github.com/leihbase/leihbase) so that each one can
later be offered back to the original project as a pull request.

The rule: **build features that could go upstream on a branch from `next`,
never from `main`.** Then a feature contains only its own changes, and none of
this fork's.

## The branches

| Branch      | What it holds                                                    | Who changes it                            |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `next`      | An exact copy of upstream's `next`                               | Only by syncing from upstream             |
| `main`      | What this fork runs: `next`, plus merged features, plus fork-only changes | Merges, and small fork-only commits |
| `feat/...`  | One feature that could go upstream, based on `next`              | You, while building the feature           |
| `fix/...`   | One bug fix that could go upstream, based on `next`              | You                                       |
| `chore/...` | Fork-only work, such as Docker setup or seed data                | You, then merged into `main`              |

Remotes:

- `origin`: this fork, `icraig-afk/leihbase-fitzharris`
- `upstream`: the original, `leihbase/leihbase`

```
upstream/next ──► next ──┬──► feat/a ──┐
                         ├──► feat/b ──┼──► main  (this fork's version)
                         └──► fix/c  ──┘     ▲
                                            fork-only commits
                                            (seed data, local Docker, …)
```

## What goes where

**On a feature branch from `next`** (could go upstream):

- New features that are useful to any Leihbase instance
- Bug fixes
- Translations, in both English and German
- Tests for the above

**On `main` only** (never upstream):

- This fork's data, such as the street seed migration
- Local setup, such as `docker-compose.local.yaml`
- Branding, and notes like this file

If a feature only makes sense for this fork, put it behind a setting that is
off by default. Neighbour verification works this way, with
`address_verification` on the `leihbase` record. Off means upstream behaves
exactly as before, which makes the feature much easier to get accepted.

## Building a new feature

### 1. Bring `next` up to date

```bash
git switch next
git fetch upstream
git merge --ff-only upstream/next   # fails if next was changed by hand
git push origin next
```

If `--ff-only` fails, a commit landed on `next` by mistake. Move it to a
branch, then reset `next` to `upstream/next`.

### 2. Branch from `next`

```bash
git switch -c feat/short-name next
```

Use `feat/…` for features, `fix/…` for bug fixes, and lowercase words joined
by hyphens.

If the feature needs another feature that isn't upstream yet, branch from
that feature instead (`git switch -c feat/b feat/a`). Say so when offering it,
and offer the earlier one first.

### 3. Build it

- Make small commits with clear messages, such as `feat: …`, `fix: …` or
  `chore: …`, as upstream does.
- Follow [CONTRIBUTING.md](./CONTRIBUTING.md): run `pnpm format` and
  `pnpm typecheck`, and add tests.
- Write English and German strings for anything a user sees.
- Database changes: one migration file per feature in
  `pocketbase/pb_migrations/`. Once a migration has run on this fork's
  database, never edit or rename it. Add a new migration instead (see
  [Migrations](#migrations)).

### 4. Test it

Run the full suite in Docker. Use its own project name, and pause the running
stack first, because both need the same ports:

```bash
docker stop leihbase-fitzharris-web-1 leihbase-fitzharris-pocketbase-1 leihbase-fitzharris-mailpit-1
docker compose -p leihbase-test -f docker-compose.test.yaml run --rm --service-ports --build app bash -c "mise run //tests:e2e"
```

Never add `--remove-orphans`, and never use the default project name here.
Either one removes the running stack's containers. The data volume survives,
but the containers have to be recreated.

### 5. Push the feature branch

```bash
git push -u origin feat/short-name
```

### 6. Use it in this fork

```bash
git switch main
git merge --no-ff feat/short-name
docker compose -f docker-compose.yaml -f docker-compose.local.yaml up -d --build
git push origin main
```

`--no-ff` keeps a merge commit, so `main` shows which feature brought which
changes.

Merge into `main`, never the other way round. A feature branch must never
contain `main`, or it would carry the fork's changes upstream.

### 7. Fixing a feature that's already in `main`

Make the fix on the feature branch, then merge that branch into `main` again.
Don't fix it on `main` directly, or the upstream version would miss the fix.

## Offering a feature upstream

1. For anything larger than a small fix, open an issue upstream first to check
   they want it, as CONTRIBUTING.md asks.
2. Update `next` (step 1), then bring the feature up to date with it:

   ```bash
   git switch feat/short-name
   git rebase next
   git push --force-with-lease
   ```

   Only rebase branches that nobody else has built on, and use
   `--force-with-lease`, never `--force`.

3. Run the tests again.
4. On GitHub, open a pull request from `icraig-afk:feat/short-name` into
   `leihbase:next`. Describe what it does, how it's switched on, and how you
   tested it.
5. Make requested changes on the same branch and push. The pull request
   updates itself. Merge the changes into `main` too.

### Checklist before opening a pull request

- [ ] Branch is based on an up-to-date `next`, and `git log next..HEAD` shows
      only this feature's commits
- [ ] No fork-only files or data (`git diff next --stat`)
- [ ] Off by default, or harmless to existing installs
- [ ] English and German strings
- [ ] Tests added, and the full suite passes
- [ ] `pnpm format:check` and `pnpm typecheck` pass
- [ ] Migrations work on a new and on an existing database

## After upstream accepts it

```bash
git switch next
git fetch upstream
git merge --ff-only upstream/next
git push origin next

git switch main
git merge next          # brings in upstream's version of the feature
git push origin main

git branch -d feat/short-name
git push origin --delete feat/short-name
```

Upstream often squashes a pull request into one commit, or changes it before
merging. The merge into `main` may then conflict where your version and
theirs differ. In that case take upstream's version, which is now the one to
keep.

## Migrations

PocketBase records each migration by its filename. That matters for features
already running on this fork:

- **Keep the filename** when offering a feature, so upstream's copy is the
  same migration this fork's database already ran.
- **Upstream asks for schema changes:** add them as a new migration on the
  feature branch rather than editing the old one. Then the fork applies only
  the difference.
- **Upstream rewrites the migration anyway:** the fork's database already has
  the old version. Before merging `next` into `main`, check that the new file
  doesn't repeat changes that already ran, such as creating a collection that
  exists. If it does, write a small fork-only migration on `main` that
  records the new file as done, or ask upstream to keep the original.

The safest option is to get a feature accepted upstream before relying on it
in production.

## Shared fixes

A fix that several features need, like the `.gitattributes` line-ending fix,
belongs on its own `fix/…` branch from `next`. Offer it first, and base the
features on it or merge it into them. Don't copy it onto each feature with
`cherry-pick`: the same change then appears as different commits on each
branch.

## Where the branches stand

| Branch                        | Status                                                    |
| ----------------------------- | --------------------------------------------------------- |
| `next`                        | Same as upstream                                          |
| `main`                        | Runs everything below except where noted, plus the street seed |
| `chore/local-docker-setup`    | Fork-only, merged into `main`                             |
| `feat/multi-location-search`  | Could go upstream, merged into `main`                     |
| `feat/neighbour-verification` | Could go upstream (off by default), merged into `main`    |
| `fix/pocketbase-dockerfile-prod-last` | Could go upstream, merged into `main` |
| `fix/password-reset-page`     | Could go upstream, merged into `main`                     |
| `fix/web-dockerfile-no-cache-mount` | Could go upstream, merged into `main`               |
| `fix/products-without-opening-hours` | Offered upstream ([#86](https://github.com/leihbase/leihbase/pull/86)), merged into `main` |
| `feat/mail-failure-alerts`    | Could go upstream (off unless configured), merged into `main` |
| `fix/admin-product-filters`   | Offered upstream ([#88](https://github.com/leihbase/leihbase/pull/88), event handling only: the select UI changes were declined), merged into `main` |
| `fix/navbar-mobile-icons`     | Could go upstream, merged into `main`                     |
| `feat/currency-setting`       | Offered upstream ([#91](https://github.com/leihbase/leihbase/pull/91), for [#89](https://github.com/leihbase/leihbase/issues/89)), EUR unless set, merged into `main` |
| `fix/location-email-reply-to` | Could go upstream, merged into `main`                     |
| `feat/location-notification-addresses` | Draft pull request upstream ([#90](https://github.com/leihbase/leihbase/pull/90)), not merged into `main` yet |

Accepted upstream, and deleted: `fix/english-text-fixes`
([#87](https://github.com/leihbase/leihbase/pull/87)).

Both feature branches carry their own copy of the `.gitattributes` fix. Offer
it upstream on its own first, as a `fix/` branch.
