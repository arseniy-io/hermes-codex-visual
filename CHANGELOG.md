# Changelog

## v0.15.138

- Show sent images as square thumbnails above the prompt and preserve the transcript position as the image draft clears.
- Place message navigation on the left. Keep file diffs folded until opened, hold the card in place when expanding its file list, and preserve the reading position when returning to a chat.
- Keep model commentary in the work disclosure, including after a turn resumes from a limit. Remove repeated status text and hidden clock updates. Show time and actions below the user message.
- Update the composer, the live file-change counter, the model and effort menus, and the inline rate-limit card. The live counter covers supported Codex and Kimi edits.
- Streamline skill proposals in Activity and reduce repeated work in Activity and the sidebar. Improve project previews and the recent-chat list.

В выпуск вошли правки отправки фото, прокрутки, навигации по чату и ленты работы. Заголовок карточки правок остаётся на месте при раскрытии списка файлов. Обновлены меню модели, карточка лимита и счётчик правок для Codex и Kimi. В «Активности» понятнее объясняется польза предлагаемого навыка и виден результат принятия.

ZIP для Windows включает интерфейсную и агентскую части одной версии. [Установка](README.ru.md#установка) · [Контрольные суммы](downloads/SHA256SUMS.txt).

## v0.15.137

- Reduce repeated work during streaming, history loading and subagent status updates. Pause refreshes for Usage and the Git summary while the window is hidden.
- Refresh new skill proposals in Activity when the gateway sends a notification. Keep the stopped status and elapsed time for an interrupted separate agent process when the chat reopens.
- Align the empty-chat welcome in the main chat and project tabs. Update change cards, file previews, tooltip placement and the left corners of the workspace.
- Include the recent improvements to hover controls, tooltips, dictation and model speed settings.

В выпуск вошли оптимизации потока ответа, истории, «Активности» и фоновых обновлений. Исправлены положение заставки, карточки правок, подсказки и углы рабочей области. После повторного открытия чата видны статус и длительность остановленной работы отдельного агента.

ZIP для Windows включает интерфейсную и агентскую части одной версии. [Установка](README.ru.md#установка) · [Контрольные суммы](downloads/SHA256SUMS.txt).

## v0.15.135

- Give chat tabs equal widths, remove folder icons and keep each close button in a fixed position within its tab. Reduce repeated work when switching chats.
- Add quick archiving and a right-click chat menu. Expand additional chats within their project and improve Git summary counts and tooltips.
- Reduce repeated work during typing, streaming and history loading. Keep the visible scroll position when opening a change card.
- Show related skill proposals with their full details in Activity. Index activity history and improve the new-chat notice border.
- Include the accumulated companion features, including Usage, saved chat and subagent history, file changes, turn controls, and model speed settings. Expand Russian coverage across the interface.

Вкладки чатов теперь одной ширины и без значков папок. При переключении, вводе и подгрузке истории приложение делает меньше повторной работы. В этот выпуск также вошли быстрый архив, дополнительные чаты внутри проекта, уточнённая сводка Git, доработки «Активности», настройка скорости модели и обновления русского интерфейса.

ZIP содержит интерфейсную и агентскую части одной версии. В комплект входят дополнения ядра для поддерживаемых версий Hermes. [Инструкция по установке](README.ru.md#установка) · [Контрольные суммы ZIP](downloads/SHA256SUMS.txt)

## v0.15.89

- Use the installed workspace SVG set in both public and local builds: 138 interface icons, 28 subagent badge pairs, and 4 installer icons.
- Remove the build-time artwork switch. `--local` changes only the output path, and both modules must be byte-identical.
- Check rendered sidebar icons before refreshing README screenshots and publish the matching ZIP.
- Record the shared artwork's provenance separately from the Tabler fallback license.
- Include the parallel Russian-copy update for model-switch warnings, error titles, and displayed chat punctuation.

Публичная и локальная сборки теперь выглядят одинаково. Общий набор сохранён из рабочего Hermes; флаг локальной сборки больше не подменяет иконки. [Проверка и объяснение](docs/release-0.15.89.md).

## v0.15.87

- Update the chat timeline, inline file links, tables, audio and video controls, and new-chat layout.
- Reduce repeated work during streamed replies and release resources when previews close.
- Refresh the project list, additional-chat navigation, native worktree dialog, and settings layout.
- Translate open summary tabs and media controls when the interface language changes. Keep live subagent activity and source labels up to date.
- Restore selected-section highlighting and adapt the theme to the current Hermes error card and delegation settings.
- Combine staged and unstaged file changes. Keep server-owned queues in the order Hermes actually sends them.

Обновлены лента чата, ссылки на файлы, таблицы, медиаплееры, проекты и настройки. Исправлены подсветка разделов и перевод открытых вкладок. Снимки в README обновлены на публичной сборке. [Проверки и ограничения / verification notes](docs/release-0.15.87.md).

## v0.15.46

- Bring the current workspace and settings changes into the GitHub release.
- Round settings cards, inputs, buttons, and badges across the built-in pages. The Nous Portal gradient now follows the card outline.
- Use opaque menus, stable project search, and clearer rescan feedback. Show the session age, project, and local computer in chat previews.
- Refine chat activity, tables, file summaries, and artifact icons.

Рабочие правки и публичная сборка теперь ведутся из одних исходников. Обновлены настройки, карточки чатов, меню, поиск проектов и артефакты.

## v0.15.29

First public release of Hermes Codex Visual.

- Codex-style dark and light workspace for Hermes Desktop.
- Project chat reordering, workspace linking, and double-click tab renaming.
- Compact composer with the Hermes queue, model picker, attachments, and dictation.
- Changes, Subagents, and Sources in the workspace summary.
- Rounded file, site, and artifact cards with the native preview and download actions.
- Tabler Icons and original subagent badges. Both sets are bundled locally.
- English and Russian setup guides, screenshots, issue forms, and a reproducible build.

Первый публичный выпуск. Установка, настройки и снимки описаны в [русском README](README.ru.md).
