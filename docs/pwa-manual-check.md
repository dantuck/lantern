# PWA manual check (offline behaviour)

The service worker's rules are covered by `test/sw.test.ts` (it runs the real `public/sw.js` in a sandbox), and static headers by `scripts/check-csp.sh`. Registration and the offline flow in a real browser are checked by hand, because automated browsers here don't support service workers. Do this once after deploying, and again after changing `public/sw.js`.

Use the deployed site (HTTPS) in Chrome or Edge with DevTools open, Application tab.

1. **Registers.** Sign in. Under *Service Workers* you should see `/sw.js` activated and running. Under *Cache Storage*: `shell-v1` (offline page and CSS), and after one more page load `assets-v1` and `pages-v1`.
2. **Offline copy.** Tick *Offline* in the Network panel and reload `/`. You should see the dashboard with a yellow "Offline. Showing a copy saved …" bar. `/p/calendar` works too if you've opened it.
3. **Private pages stay private.** Still offline, open `/admin` and `/devices`. You should get the plain "You're offline" page, never a saved copy. `pages-v1` must contain only `/` and `/p/<id>` entries.
4. **Sign-out forgets.** Go online, press *Sign out*. `pages-v1` should disappear from Cache Storage. Go offline and reload `/`: you should get the "You're offline" page.
5. **Revocation forgets.** Sign in again and open `/`. From another device, sign this device out (Devices page). Back here, reload while online: you're sent to the sign-in page and `pages-v1` is gone.
6. **Expiry.** Saved pages older than 24 hours are refused. To check, edit the `x-sw-cached-at` value in a cached response to a day ago, or just wait.
7. **Install.** Chrome shows an install icon in the address bar (and an "Install app" item appears in the side rail, or under More on a phone). On a phone or tablet, from the second visit, a dismissible banner offers install; Chrome and Android get an Install button, iPhone and iPad get "Tap Share, then Add to Home Screen". The banner stays away once installed or dismissed (30 days), and nothing shows when running installed. On iPhone: Safari → Share → Add to Home Screen, and the icon is the green grid. The installed app opens standalone on `/`.

If offline copies are too much for your household's threat model, set `OFFLINE_PAGES = false` at the top of `public/sw.js` (and bump `VERSION`). The app still installs, and assets and the offline page still work, but no signed-in page is ever stored on the device.
