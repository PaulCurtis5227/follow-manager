# Follow Manager

A [Sauce for Zwift](https://github.com/SauceLLC/sauce4zwift) **mod** for managing your Zwift
follows in bulk.

Zwift lets you follow at most **5,000** people, and its own UI gives you no practical way to manage
lists that run into the thousands. Worse: when you request to follow someone who never accepts (or
rejects), that pending request **still counts toward your 5,000 limit** but never appears in your
following list — so you can silently run out of slots. Follow Manager helps you:

- **Follow back everyone who follows you** — one button, throttled and safe.
- **Prune one-way follows toward a target** — pick how many to remove; review the exact list first.
- **Spot phantom slots** — enter the follower/following counts Zwift shows you and the mod tells you
  how many are missing/hidden.

> [!WARNING]
> Following and unfollowing act on your **real Zwift account** through Sauce's authenticated session.
> Bulk actions are throttled and always ask for confirmation, but they are still real. Start small.

## What it shows

The Control window has three parts:

1. **Verification banner + quota gauge.** Enter the *Following* and *Followers* counts from the
   Zwift companion app or [zwift.com](https://www.zwift.com) profile. The mod compares them to the
   lists it can actually see and warns — in red — if any are missing (the likely phantom/pending
   slots). It **warns but never blocks** you. A gauge shows `following / 5,000`.
2. **Follow back your followers.** A scrollable list of everyone who follows you that you don't
   follow back. Remove anyone you don't want with the ✕, then **Follow all**.
3. **Prune your following.** By default this lists the people you follow who *don't* follow you back
   (toggle to include everyone). Set **how many to remove** (or Select all), fine-tune the list with
   ✕, then **Unfollow selected**.

Both bulk actions run **sequentially with a configurable delay** (default 600 ms) to respect Zwift's
rate limits, show a live progress bar, and can be **Stopped** mid-run.

### About the counts

Sauce does not expose your true follower/following counts to mods, so verification uses the numbers
**you** enter (read them from the Zwift app/website). The mod also flags when a list looks
incomplete (e.g. Sauce is still syncing). Likewise, Zwift's API doesn't let any mod enumerate your
un-accepted *outgoing* requests, so those phantom slots can be **counted** but not individually
cancelled from here.

## Install

Sauce loads mods as unpacked folders inside its **SauceMods** directory.

### Released version (recommended)

1. Download `follow-manager-vX.Y.Z.zip` from the [Releases](../../releases) page.
2. In Sauce, open **Settings → Mods** and use **Open mods folder**.
3. Unzip so you get a `follow-manager/` folder inside SauceMods.
4. Restart Sauce and enable **Follow Manager** in **Settings → Mods**.

### From source (developers)

```sh
npm run dev-link        # junction this repo into SauceMods (restart Sauce after)
npm run build           # produce dist/follow-manager/ (a clean release folder)
npm run install-release # copy that folder into SauceMods
npm run package         # zip the committed files for a GitHub release
npm test                # headless unit tests for the follow engine
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
