# v0.15.89: one workspace icon set

[English README](../README.md) · [Русский README](../README.ru.md)

## What changed

The public build previously used Tabler fallbacks while the owner's installed local build loaded a separate SVG set from `.local/assets.json`. As a result, the README screenshots and Git/ZIP installations had different icons from that workspace, despite sharing a version number.

Both builds now import `source/visual-assets.json`: the same 138 interface icons, 28 subagent badge pairs, and 4 installer icons preserved from the installed theme. The owner explicitly approved publishing the set on 19 November 2026. `--local` selects the output file only; it no longer changes artwork or version metadata. A public build no longer needs any file from `.local/`.

The retained Tabler paths are fallbacks for future icon names outside the shared set. The shared SVG set is not Tabler artwork and is not covered by its MIT license; see [asset notices](../THIRD_PARTY_NOTICES.txt).

## Verification

`node verification/visual-assets.mjs` checks all 138 registry masks, the 28 badge pairs, the installer icons, inert SVG content, and byte equality between the two compiled modules. An optional path argument compares the shared set with a preserved pre-update asset file.

The README capture scenario compares five rendered navigation icons and the expanded project folder against the shared SVGs before saving screenshots. Captures use the exact ZIP module in an isolated Hermes profile with a synthetic Atlas conversation, in dark and light themes and with the stock-theme comparison.

Verified on Windows with Hermes Desktop v0.23.1+2062 and Electron 44.9.3. The exact ZIP module passed the README/rendered-icon scenario and the parallel Russian-copy scenario, including model-switch confirmation, connection errors, chat punctuation, locale and theme changes. The installed module matched the ZIP, Hermes recorded v0.15.89 in the Codex theme, and its existing chat and message input remained available.

- Public and local ZIP SHA-256: `3115a3af3ced5e6e6227c5d4e6a923c7950b837b4ca7dd0ec9b0dfb9a9c20cb0`.
- Shared module SHA-256: `58a86a7a885100f3baeae1294d90559061c4547984978ddd3b3357db2d3fb92e`.

The broader model-switch and general five-file smoke-test limitations recorded for [v0.15.87](release-0.15.87.md) are outside this artwork change.

## По-русски

Причина различия была в двух наборах: публичная сборка использовала Tabler, а рабочий Hermes загружал прежние SVG только при локальной сборке. Теперь общий файл в исходниках содержит ровно тот набор, который был установлен у владельца. Публичный и локальный модули должны совпадать побайтово.

Проверка охватывает весь набор данных и реальные значки боковой панели в Hermes. Скриншоты README снимаются на той же сборке, которая лежит в ZIP. Исходный `.local/assets.json` остаётся резервной копией; сборка его больше не читает.
