# v0.15.87

[English README](../README.md) · [Русский README](../README.ru.md) · [Changelog](../CHANGELOG.md)

## Changes

This release brings the workspace changes since v0.15.71 into the public build: inline file links, table and media controls, new-chat layout, project navigation, and fewer repeated updates during streamed replies. It also fixes selected-section highlighting, open-tab translation, live subagent activity, combined staged and unstaged changes, and compatibility with the current Hermes error card and worktree dialog.

The public ZIP and the root `plugin.js` use MIT-licensed Tabler icons and original subagent badges. The screenshots in both READMEs show this public build in an isolated Atlas demo workspace. They use synthetic conversation content; the stock comparison shows the same chat with the built-in Nous theme.

## Verification

Verified environment: Windows, Hermes Desktop v0.23.1+2062, Electron 44.9.3. The generated module is checked against the source build, and the ZIP module is checked byte for byte against the root `plugin.js`. [SHA-256 checksums](../downloads/SHA256SUMS.txt).

The local build from the same sources passed targeted checks for navigation highlighting, the current error card, settings, local environment actions, summary tabs and their language changes, file changes, and the model menu. The exact public ZIP module separately passed error-card, navigation-highlight, and open-tab language checks. Its screenshot scenario opens both color modes, switches to the stock theme, and opens subagent settings.

Two broader checks remain open. Switching the test model can be acknowledged by Hermes while the previous model remains visible; the same behavior occurs with the built-in Nous theme. A passing model label alone is not treated as proof that the next inference request used the new model. The general smoke test also fails on its five-file summary, although the separate one-file and five-file change-card scenario passes. This release does not claim that either issue is resolved.

## По-русски

Выпуск объединяет накопленные изменения после v0.15.71. Обновлены лента и поле ввода, таблицы, аудио и видео, проекты и настройки. Исправлены подсветка разделов, перевод открытых вкладок, обновление активности субагентов и просмотр подготовленных вместе с неподготовленными изменениями файлов.

Снимки сделаны на публичной сборке в отдельном демонстрационном профиле. Локальные иконки и личные чаты в публикацию не входят.

Целевые сценарии проверены отдельно. Общий прогон карточки пяти файлов и реальное переключение тестовой модели остаются незакрытыми. Подтверждение модели в меню не считается доказательством её использования в следующем ответе.
