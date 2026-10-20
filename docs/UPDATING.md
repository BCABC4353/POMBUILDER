# Updating POM Builder (operator guide)

This is for **you** (the maintainer), not end users. It explains how the app
updates itself and how to push an urgent fix immediately.

## How updates normally work

**Windows:** the app checks GitHub on launch and every ~2 hours, downloads any
newer version **in the background**, and installs it **silently the next time
the user closes and reopens the app.** No clicks, no prompt. Most updates are
invisible — the app just becomes the new version, still signed in. (A re-login
only happens when an update changes the Microsoft permissions it requests.)

To ship a normal update: run the **"Build and Release"** workflow (Actions
tab → Run workflow → patch/minor/major). Windows users get it on their next
restart.

## Pushing an URGENT fix NOW (the force lever)

When something is broken and you need it live on all Windows machines fast
(not waiting for each user's next restart):

1. **Publish the fix** — run the Build and Release workflow. Note the new version
   it produces (e.g. `v1.0.2`).
2. **Flip the force lever** — edit [`update-policy.json`](../update-policy.json)
   on the `main` branch and set:
   ```json
   { "forceMinVersion": "1.0.2" }
   ```
   Commit it. **No build needed for this step** — it's just a one-line file.
3. **Done.** Within **~10–15 minutes**, every running Windows app below `1.0.2`
   downloads it and **auto-restarts into it** (after a brief "a required update
   is ready" warning; the app restarts on its own after ~30s).

That ~10–15 min is the floor: the app polls for the change — there's no way to
instantly push. It is fully hands-free, though; you don't chase anyone.

**After the urgent push settles**, you can leave `forceMinVersion` where it is
(it only forces apps *below* that version, so once everyone's updated it's inert)
or set it back to `0.0.0`.

## Using RELEASE_REQUEST for a one-step release

Edit `RELEASE_REQUEST` on `main` to `patch`, `minor`, or `major` and commit.
The Release Bridge workflow automatically dispatches the Build and Release run.

## Rolling back a bad version

To recover from a bad release, **publish a higher version with the fix** and, if
urgent, set `forceMinVersion` to it. Everyone auto-jumps forward to the good one.

## Notes

- Rapid-fire releases are safe: the updater always jumps to the **latest**
  published release, skipping any intermediate versions.
- A failed update never harms anyone — the download is isolated and the running
  version keeps working.
- The installer prompts for an output folder once; subsequent installs and forced
  updates run silently and skip the prompt.
