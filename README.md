# Masterbuilt Cook Card

A Lovelace card for Masterbuilt Gravity Series grills: live cook state, a chart pinned to the cook rather than to an arbitrary window, and a picker for every past cook — including ones from before Home Assistant knew the grill existed.

Companion to the [masterbuilt-gravity-ha](https://github.com/lucvan/masterbuilt-gravity-ha) integration, which it requires.

Not affiliated with, endorsed by, or supported by Masterbuilt or Middleby.

## Why a card at all

Home Assistant's built-in `history-graph` is good, and this card uses it by default for the live view. What it cannot do is the reason this exists:

- **It has no start/end window.** `hours_to_show` always ends at *now*, so it cannot display a cook that finished last Tuesday.
- **It only knows what Recorder has.** Cooks from before you installed the integration, or from while Home Assistant was down, or since purged, are not in the database at all — but they are still in Masterbuilt's cloud at roughly 10-second resolution.

So the card drives the built-in graph for live cooks (native look, HA's own tooltips and theming), and draws its own chart for historic ones, where the data comes back from an action response rather than the database.

## Requires

- [masterbuilt-gravity-ha](https://github.com/lucvan/masterbuilt-gravity-ha) v0.5.0 or newer — the card calls its `list_cooks` and `get_cook_history` actions
- Home Assistant 2024.11+

## Install

**HACS** → ⋮ → *Custom repositories* → add `https://github.com/lucvan/masterbuilt-cook-card`, category **Dashboard** → install.

HACS registers the resource for you. If you manage resources manually, add `/hacsfiles/masterbuilt-cook-card/masterbuilt-cook-card.js` as a JavaScript module.

## Use

Add the card and point it at your grill's device:

```yaml
type: custom:masterbuilt-cook-card
device: 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d
title: Smoker
```

The device id is in the URL of the device page (*Settings → Devices & Services → Masterbuilt Gravity → your grill*). Everything else is discovered from it — the card finds its entities through the entity registry, so you never list them.

### Options

| Option | Default | |
|---|---|---|
| `device` | *required* | Device id of the grill |
| `title` | `Cook` | Card heading |
| `probes` | `[1, 2, 3, 4]` | Which probes to show |
| `live_chart` | `native` | `native` uses Home Assistant's `history-graph`. `custom` draws the card's own chart with per-series styling |
| `default_mode` | `live` | `live` or `history` |
| `max_points` | `400` | Points per series when fetching a cook |
| `idle_hours` | `2` | Hours the live chart shows when no cook is running |
| `min_hours` | `0.5` | Floor for the live window, so a just-lit grill isn't charted over 4 minutes |
| `entities` | *auto* | Override discovery: `{grill: sensor.x, target: sensor.y, probe1: …}` |

### `live_chart: native` vs `custom`

`native` embeds Home Assistant's own history-graph and sizes `hours_to_show` to the cook so far, refreshed as it runs. You get HA's tooltips, theming, and interactions, and the card stays out of the charting business.

`custom` draws an SVG instead, with the styling this card ships: grill in thick red, target in thin dashed yellow, probes in blue/green/purple/orange, and a crosshair readout. Use it if you want the live and history views to look identical, or want per-series colours and widths that `history-graph` does not offer.

History mode always uses the custom chart — the built-in one cannot show an arbitrary past window.

## History mode

Switching to **History** lists every cook the cloud still holds, newest first, with date and duration. Picking one loads it.

The card shows where the data came from — `recorder` when your own database covered the cook, `cloud` when it had to be fetched from Masterbuilt. That decision is the integration's; see its README for the rule.

## Stale-data warning

When `binary_sensor.<grill>_stale_data` is on, the card shows a banner across the top. That sensor exists because the grill can carry on cooking while its WiFi module wedges — the cloud then serves a frozen shadow that eventually reads "off" while the meat is still cooking. Take the banner seriously and check the grill physically.

## License

MIT — see [LICENSE](LICENSE).
