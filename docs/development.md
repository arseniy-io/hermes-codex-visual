# Development

[English README](../README.md) · [Русский README](../README.ru.md) · [Проверка в Hermes](#проверка-в-hermes)

## Build

Use Node.js 22 or newer. Run `npm ci`, `npm run build`, and `npm run check`. The check rebuilds the plugin in memory, compares it to the checked-in `plugin.js`, and checks the JavaScript syntax.

`source/plugin.js` registers the theme and the UI contributions. The generated root `plugin.js` leaves React and the Hermes plugin SDK to the host. It includes the license notices and ships with the repository so Hermes can install it from Git.

To prepare release assets, run `python scripts/package.py` after the build check. It writes a ZIP and SHA-256 checksums to `dist/`.

Use this repository for source changes, builds, and releases. The tracked root `plugin.js` is generated from `source/` with `npm run build`. The repository bundles MIT-licensed Tabler icons and original subagent badges.

## Test in Hermes

Use a separate Hermes profile and a demo project. Put the built file in `desktop-plugins/hermes-codex-visual/plugin.js`, rescan, enable the plugin, and select the **Codex** theme. Check the chat, composer, project ordering, and right panel in both themes. Open a file preview and verify that **Download** produces the original bytes.

The optional Playwright suite in `verification/` uses a built local Hermes Desktop checkout and its Python environment. Set `HERMES_VISUAL_DESKTOP`, `HERMES_VISUAL_PYTHON`, and `HERMES_VISUAL_FIXTURE_PLUGIN` to those paths and the generated root `plugin.js`. Run that checkout's Playwright CLI with `test --config verification/playwright.config.mjs`. Use `HERMES_VISUAL_FOCUS=settings-audit` for the full settings walk.

## Проверка в Hermes

Используй отдельный профиль Hermes и тестовый проект. Скопируй собранный файл в `desktop-plugins/hermes-codex-visual/plugin.js`, пересканируй плагины, включи плагин и выбери тему **Codex**. Проверь ленту, поле ввода, порядок чатов и правую панель в обеих темах. Открой предпросмотр файла и сравни скачанную копию с оригиналом.

Для сборки нужны Node.js 22 или новее и команды `npm ci`, `npm run build`, `npm run check`. После успешной проверки `python scripts/package.py` создаст ZIP и контрольные суммы в `dist/`.

Исходники, сборка и выпуск ведутся в этом репозитории. Команда `npm run build` обновляет корневой `plugin.js` из `source/`. В плагин входят значки Tabler с лицензией MIT и собственные значки субагентов.
