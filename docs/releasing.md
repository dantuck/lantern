# Releasing

For whoever publishes new versions of the dashboard. Households deploy from source they check out themselves
(`npm run update`), so a release is a signed git tag, and a changelog people can read before they update.

1. **Changelog.** Move `[Unreleased]` entries under a new `## [x.y.z] - YYYY-MM-DD` heading, written for the
   person running the dashboard. Put anything they must do under `### Action required`.
2. **Version.** Set `version` in `package.json` to `x.y.z` (plain numbers only). A test fails if the changelog has
   no entry for it.
3. **Migrations.** A new `migrations/NNNN_name.sql` must be numbered without gaps, compatible with the previous
   release (the database is migrated just before the new code goes live), and sealed with
   `npm run migrations:seal`. A shipped migration is never edited: a test fails if its hash changes. Fix mistakes
   with a new migration.
4. **Verify.** `npm run verify && npm run verify:e2e` (if something else uses port 8787, `CSP_PORT=18787`).
5. **Tag, signed.** `git tag -s vx.y.z -m "vx.y.z"` then `git push --tags`. `npm run update` verifies the
   signature when the tag is on HEAD, so publish your signing key (for SSH signing, an `allowed_signers` file) where
   users can find it, such as the repository README or your site, and say which fingerprint to expect.
6. **Never rewrite a published tag.** If a release is bad, ship a new patch release.
