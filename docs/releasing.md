# Releasing

For whoever publishes new versions of the dashboard. Households deploy from source they check out themselves
(`npm run update`), so a release is a git tag with a changelog people can read before they update.
Releases are automated with [release-please](https://github.com/googleapis/release-please).

1. **Write conventional commits** on `main` (`feat:`, `fix:`, `feat!:` or a `BREAKING CHANGE:` footer). While the
   version is below 1.0.0, `feat` bumps the minor number and a breaking change also bumps the minor number.
   `docs`, `test`, `ci`, `build`, `chore` and `style` commits are left out of the notes.
2. **Release PR.** After each push to `main`, the Release workflow opens (or updates) a PR called
   `chore(main): release x.y.z`. It bumps `package.json` and `package-lock.json` and adds the entry to `CHANGELOG.md`.
   Edit the changelog in that PR so it reads well for the person running the dashboard, and put anything they must do
   under an `### Action required` heading (a test fails if the changelog has no entry for the version).
3. **Migrations.** A new `migrations/NNNN_name.sql` must be numbered without gaps, compatible with the previous
   release (the database is migrated just before the new code goes live), and sealed with
   `npm run migrations:seal`. A shipped migration is never edited: a test fails if its hash changes. Fix mistakes
   with a new migration.
4. **Merge the release PR** when CI on `main` is green. The workflow tags `vx.y.z`, publishes the GitHub release with
   that changelog entry, then reruns `npm run verify` and `npm run verify:e2e` on the tag. Households then
   `git fetch --tags`, check out the tag and run `npm run update`.
5. **Never rewrite a published tag.** If a release is bad, ship a new patch release.

One-time repository setting: Settings, Actions, General, "Allow GitHub Actions to create and approve pull requests".
Pull requests opened with the default token do not start CI on their own; push an empty commit to the release branch
or close and reopen the PR if you want the checks to run before merging.

Tags are not signed. If you later want signed tags, create them yourself (`git tag -s`) instead of merging the PR's
automation, or use a deploy key / GitHub App for the workflow.
