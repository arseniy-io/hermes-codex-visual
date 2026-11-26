# Development

[English README](../README.md) · [Русский README](../README.ru.md) · [Проверка в Hermes](#проверка-в-hermes)

## Build

For a shared local workspace, follow [ownership](#общая-запись) before writing sources or release outputs. A clean public clone keeps the Node-only build below. The first ownership acquisition opts a workspace into checks; releasing ownership keeps those checks enabled. Find the relevant component and focused test in [CODE_MAP](../CODE_MAP.md).

Use Node.js 22 or newer. Run `npm ci`, `npm run build`, and `npm run check`. The check rebuilds the plugin in memory, compares it to the checked-in `plugin.js`, and checks the JavaScript syntax.

`source/plugin.js` registers the theme and the UI contributions. The generated root `plugin.js` leaves React and the Hermes plugin SDK to the host. It includes the license notices and ships with the repository so Hermes can install it from Git.

To prepare release assets, run `python scripts/package.py` after the build check. It writes a ZIP and SHA-256 checksums to `dist/`.

Use this repository for source changes, builds, and releases. The tracked root `plugin.js` is generated from `source/` with `npm run build`. Both public and local builds import the shared workspace artwork from `source/visual-assets.json`. Tabler paths remain fallbacks; artwork provenance and license scope are recorded in [THIRD_PARTY_NOTICES.txt](../THIRD_PARTY_NOTICES.txt).

`node scripts/build.mjs --local` writes the same module to `.local/plugin.js`; it changes the destination only. Run both builds, then `node verification/visual-assets.mjs` to verify byte equality, registry masks, avatars, and installer icons. The build never reads the owner's backup `.local/assets.json`.

## Test in Hermes

Use a separate Hermes profile and a demo project. Put the built file in `desktop-plugins/hermes-codex-visual/plugin.js`, rescan, enable the plugin, and select the **Codex** theme. Choose the affected scenario from [CODE_MAP](../CODE_MAP.md); widen coverage for shared styles or changed behavior. For file preview changes, verify that **Download** produces the original bytes.

The optional Playwright suite in `verification/` uses a built local Hermes Desktop checkout and its Python environment. Set `HERMES_VISUAL_DESKTOP`, `HERMES_VISUAL_PYTHON`, and `HERMES_VISUAL_FIXTURE_PLUGIN` to those paths and the generated root `plugin.js`. Run that checkout's Playwright CLI with `test --config verification/playwright.config.mjs`. Use `HERMES_VISUAL_FOCUS=settings-audit` for the full settings walk. Direct runs, including baseline runs, a caller-selected Python and runs without a Focus, keep this route; they do not verify the private runtime pin or provide a release receipt. `run-local.ps1` explicitly enables the additional pinned-runtime and gateway checks.

Use `HERMES_VISUAL_FOCUS=readme` to refresh the public screenshots in `docs/images/` with a synthetic Atlas chat. Point `HERMES_VISUAL_FIXTURE_PLUGIN` at the public module from the ZIP. The scenario captures dark and light workspaces, the stock-theme comparison, and subagent settings. Keep captures and verification in disposable profiles; the test teardown checks a gateway's profile and process identity before stopping it. The cleanup helper requires Python's `psutil` package.

Passing focused scenarios does not imply a passing full suite. Record known failures alongside release notes; see [v0.15.87](release-0.15.87.md).

## Usage analytics in source builds

Starting with the 0.15.94 source build, the Usage page also needs the agent companion from the same build. For a Git installation, install and enable both the desktop and agent parts. For a ZIP, place `plugin.js` under `desktop-plugins/hermes-codex-visual/`, and all agent files declared by `hermesAgentPackage` in [the packager](../scripts/package.py), including `plugin.yaml` and `dashboard/`, under `plugins/hermes-codex-visual/`. Enable the agent plugin for the intended profile with `hermes plugins enable hermes-codex-visual`, then rescan the desktop plugins. Update both parts together. A previously loaded agent backend may need a normal gateway restart before updated Python code takes effect.

The Usage history and plan history cover the whole connected OpenAI account; the chat list covers the active Hermes profile. The chat percentage is lifetime chat usage relative to the current full weekly allowance. Missing or partial data is labelled. Resetting requires a separate confirmation; an assistant can only request review, and its tool becomes available in a new chat after activation.

## Маленькая правка

Обычные изменения плагина сдавай по [маршруту накопительного выпуска](accumulated-release.md). Временная проверка отдельной задачи и установка общего выпуска имеют разные статусы. Шаги общей записи и установки ниже применяются к разрешённому общему выпуску.

1. Прочитай действующие инструкции и одну строку [карты](../CODE_MAP.md). Открой относящиеся к задаче исходники и сценарий, а историю - только если нужен конкретный источник. Документация проверяется чтением, ссылками и передачей задачи новому исполнителю; служебная команда - собственными тестами. Эти изменения сами по себе не требуют версии плагина, ZIP или запуска Hermes.
2. До записи общих входов займи право по [порядку ниже](#общая-запись). Сверь текущие байты своих файлов с прочитанными, сохрани чужие изменения и исходные байты затронутых файлов. Если установленный модуль и кандидат отличаются, выясни их роли до выпуска. Подготовь одну ограниченную правку; для изменения содержимого плагина выбери свободный номер в обоих манифестах.
3. Собери корневой и локальный модули, проверь воспроизводимость и совпадение, упакуй один итоговый локальный ZIP. `npm ci` нужен при установке/изменении зависимостей, а не перед каждой мелкой правкой. Обычные команды: `npm run build`, `npm run check`, `node scripts/build.mjs --local`, `node scripts/build.mjs --local --check`, `python scripts/package.py --local`.
4. Распакуй этот ZIP в уникальную папку своего прогона, сравни байты `hermes-codex-visual/plugin.js` с `.local/plugin.js` и передай распакованный файл в целевой сценарий. Для узкой правки достаточно одного успешного окончательного прогона, который покрывает затронутые состояния и штатное действие. Не запускай одинаковый сценарий подряд на preview, исходной сборке и том же ZIP без новой причины. Если нужен замер «до», сначала измерь установленный исходный модуль на том же Desktop. После изменения проверяемых входов старый результат не переносится на новый ZIP. Общий стиль, новая логика или несколько сценариев требуют соответствующих дополнительных проверок.
5. Установи проверенный файл из ZIP по действующим правилам проекта с временной копией предыдущего модуля. Примени штатным пересканированием; проверь совпадение байтов и свежую запись загрузки нужной версии. Автоматическую загрузку наблюдателем записывай отдельно от выполненного ручного пересканирования. Неполученный снимок не выдавай за визуальную проверку рабочего окна. Не повторяй сборку только из-за недоступности снимка, если входы не изменились.
6. Сохрани короткий результат с версиями, хешами, проверенными состояниями и ограничениями. Заверши необходимую общую очистку по правилам проекта и освободи запись. Дополнительные обсуждения и расследования после завершённого выпуска не удерживают право записи; новое изменение снова начинается с его получения.

Пример одного целевого запуска из корня после сборки. Версия и имя прогона относятся именно к своему кандидату; если распаковка уже существует, выбери новое имя, не перезаписывай её:

```powershell
$taskVersion = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$taskRun = '.local/check-' + [guid]::NewGuid().ToString('N')
Expand-Archive -LiteralPath "dist/hermes-codex-visual-v$taskVersion-local.zip" -DestinationPath $taskRun
$taskPlugin = Join-Path $taskRun 'hermes-codex-visual/plugin.js'
if ((Get-FileHash -LiteralPath $taskPlugin).Hash -ne (Get-FileHash -LiteralPath .local/plugin.js).Hash) { throw 'ZIP module differs' }
.\verification\run-local.ps1 -Focus sidebar-activity -Plugin $taskPlugin -EvidenceVersion ('thinking-' + [guid]::NewGuid().ToString('N'))
```

Для MCP вместо `sidebar-activity` выбери `mcp-page`; остальные ветки указаны в карте. [run-local.ps1](../verification/run-local.ps1) задаёт отдельные `HERMES_HOME`, профиль приложения, локальные подмены и очищает унаследованные Git-переадресации. До запуска проверь доверенные входы и фактическую изоляцию по действующему проектному маршруту. Свежая строка `Fixture module SHA-256` должна совпасть с модулем из проверяемого ZIP.

## Общая запись

Канонический порядок для нескольких чатов в одной папке. Один владелец меняет общие `source/`, манифесты, сборщики, корневой/локальный модуль, `dist/`, рабочую установку и общую очистку. Остальные параллельно читают, находят источник, готовят предложение и точный diff в своих уникальных временных артефактах вне входов сборки. Общий `source/` не является отдельной копией для каждого чата. Документы можно готовить независимо, если их точные файлы не заняты другим исполнителем.

Совместимые подготовленные правки разных задач можно объединить в один выпуск. Владелец сверяет основу и содержание каждой правки, остальные входы сборки и объединённый список проверок. Одна версия и одна установка общего ZIP относятся ко всем включённым задачам; каждая считается завершённой после проверки своих сценариев и подтверждения установки. Подготовка и команды описаны в [порядке совместного выпуска](parallel-release-workflow.md).

[release_lock.py](../scripts/release_lock.py) хранит владельца и стадию в `.local/release-owner.json`. `status` только читает и немедленно сообщает `owner`, `task`, `phase`. Решение о передаче принимается по этой записи и состоянию файлов, а не по `active/idle` или финальному сообщению соседнего чата. Не считывай всю чужую переписку и не опрашивай её по кругу ради ожидания сборки.

В каждом новом shell-вызове, который пишет общие выходы, задавай того же владельца. Значение - ID текущего чата; короткое имя ниже только пример:

```powershell
python -B scripts/release_lock.py status
$env:HCV_RELEASE_OWNER = 'my-chat-id'
python -B scripts/release_lock.py acquire --task 'Короткое описание правки'
# После успешного acquire - правка и нужные команды из маршрута выше.
python -B scripts/release_lock.py phase --phase build
# Перед целевым тестом: phase --phase test; перед установкой: phase --phase install.
# Освобождать только после завершения ВСЕХ запущенных своих команд и общей работы.
python -B scripts/release_lock.py release --note 'Результат и проверки сохранены'
```

Если `acquire` вернул ненулевой код и занятого владельца, не переходи к записи. Подготовь независимую часть, затем проверь `status`. Получение свободной записи позволяет продолжить до завершения чужого чата; после передачи заново сверь изменившиеся входы и кандидат. Стадия `verified` сама по себе не освобождает запись: нужен успешный `release`.

Первый `acquire` включает защиту обычных сборок в этой папке. После `release` запись остаётся включённой с `owner: null`; следующая сборка/упаковка без нового владельца отклоняется до записи. `build --check` читает и не требует владельца, но не гарантирует стабильность исходников при чужой записи. В чистом публичном клоне без записи координации и без `HCV_RELEASE_OWNER` сохранён прежний маршрут. Только для подключённой папки Node вызывает Python; другой интерпретатор задаётся через `HCV_RELEASE_PYTHON` (например, `python3` в Unix). Битый, пустой, недоступный state, чужой владелец, неизвестная схема и ссылки/junction вместо путей дают ошибку, а не отключают защиту.

Это кооперативное право записи, не разграничение доступа ОС: редактор и команды, обходящие процедуру, физически не заблокированы. Короткий OS guard защищает транзакцию состояния, а сборщик/упаковщик повторяют проверку владельца перед записью. Они не удерживают OS guard на всё время сборки. Поэтому владелец обязан дождаться завершения всех своих команд перед `release`; чужой чат не освобождает его запись посреди работы. Уже запущенная до подключения защиты команда не останавливается задним числом.

`release-owner.json` и постоянный `release-owner.guard` не удаляются при очистке. Нет автоматического снятия по возрасту, PID или завершению чата. Если владелец исчез: прочитай `status`, подтверди отсутствие его активных команд, сохрани и проверь незавершённое дерево/артефакты. Только после этого допустима осознанная передача: `release --owner прежний-id --note причина`, затем `acquire` нового владельца и повтор затронутых проверок. Если отсутствие записи подтвердить нельзя, передача остаётся заблокированной. Непроверенный или прерванный кандидат не обозначается готовым; сначала восстанови известную основу либо зафиксируй безопасную передачу незавершённой работы.

Проверка инструмента: `python -B verification/release-lock.test.py`. Она использует искусственные временные каталоги, не запускает Hermes и не устанавливает плагин.

## Проверка в Hermes

Используй отдельный профиль Hermes и тестовый проект. Скопируй собранный файл в `desktop-plugins/hermes-codex-visual/plugin.js`, пересканируй плагины, включи плагин и выбери тему **Codex**. Выбери затронутый сценарий по [карте](../CODE_MAP.md), а дополнительные проверки - по [маленькому маршруту](#маленькая-правка). При правке предпросмотра файла сравни скачанную копию с оригиналом.

### Лимит чата

В одном чате проекта максимум **10 сообщений** суммарно от человека и агента. Правило действует и для тестовых чатов, в том числе с заранее подготовленной историей. Считай отдельные реплики человека и текстовые реплики агента. Вызовы инструментов, их результаты и служебные записи идут отдельно.

Перед отправкой оставь место для сообщения и ответа. Если следующий шаг превышает лимит, открой свежий чат и передай в него только задачу и нужные результаты. Для проверки длинной прокрутки используй длинный текст внутри сообщения. Для проверки загрузки истории по частям передавай тестовые записи напрямую в проверяемую функцию.

Оконные тесты ставят ограничение в базах временных профилей до запуска Hermes. Запись 11-го сообщения блокируется даже при сохранении нескольких сообщений сразу. После завершения прогона проверка удаляет временный профиль целиком и подтверждает его отсутствие. Для чата в постоянном тестовом профиле используй штатное удаление и проверь, что сообщения и файлы истории исчезли. Если тест ещё использует чат, дождись штатного завершения прогона.

### Сборка и упаковка

Для сборки нужны Node.js 22 или новее и команды `npm ci`, `npm run build`, `npm run check`. После успешной проверки `python scripts/package.py` создаст ZIP и контрольные суммы в `dist/`.

Исходники, сборка и выпуск ведутся в этом репозитории. Команда `npm run build` обновляет корневой `plugin.js` из `source/`. Публичная и локальная сборки используют общий набор `source/visual-assets.json`. Флаг `--local` меняет только путь результата. Проверка `node verification/visual-assets.mjs` подтверждает совпадение модулей и всех SVG. Происхождение значков и область действия лицензий описаны в [THIRD_PARTY_NOTICES.txt](../THIRD_PARTY_NOTICES.txt).

### Отдельная среда Python для проверки

`verification/run-local.ps1` использует отдельную Python-среду с проверенными
зависимостями. Если она отсутствует или изменилась, сценарий останавливается с
ошибкой `Private test runtime is unavailable or changed`. Он не выбирает другую
среду автоматически. При изменении среды во время проверки результат также
считается неуспешным.

Прямой запуск Playwright остаётся доступен для baseline, выбранного вручную
Python и общего сценария без Focus. Он использует переданные пользователем пути,
выводит предупреждение `HCV_UNPINNED_PLAYWRIGHT` и не подтверждает закреплённую
среду или проверку gateway. Такой запуск не является подтверждением выпуска.
Только `run-local.ps1` явно включает дополнительную проверку закреплённой среды;
release workflow требует её результат и не принимает прямой запуск вместо неё.

Подготовитель рассчитан на указанные в его коде версии установленного Hermes,
Python и `uv`. Он создаёт новый уникальный каталог и собственные кэш и временные
папки, может загружать зафиксированные зависимости и не очищает старые среды:

```powershell
python -I -B scripts/prepare_test_runtime.py
```

Команда сообщает путь `pin-candidate.json` только после завершения проверок.
Просмотри журнал и созданный PIN; в нём нет секретов, но его номер и контрольные
суммы относятся к этой конкретной машине и каталогу. Перед использованием
внеси проверенный PIN в `verification/test-runtime-pin.json` и обнови разрешённый
SHA этого файла в `scripts/release_workflow.py` по [порядку общей записи](#общая-запись).
Изменения подготовителя требуют повторного ревью и его проверок; изменения
защитной проверки, проверки gateway или runner - также обновления соответствующих разрешённых SHA. Незавершённую
среду или незнакомый каталог использовать нельзя.

После обновления Hermes, Python или зависимостей, а также на другой машине нужна
новая подготовка и проверка. Фиксированные версии и SHA в коде сначала придётся
сверить и при необходимости обновить: автоматической универсальной настройки
здесь нет. Проверка фиксирует отдельную среду, но не все внешние исходники Hermes,
базовый Python и Electron, поэтому `external_runtime_verified` остаётся `false`.

## Аналитика использования в сборке из исходников

Начиная со сборки 0.15.94, странице «Использование» также нужна агентская часть той же версии. При установке из Git установи и включи обе части: интерфейсную и агентскую. При установке из ZIP положи `plugin.js` в `desktop-plugins/hermes-codex-visual/`, а все файлы агентской части, перечисленные для `hermesAgentPackage` в [сборщике](../scripts/package.py), включая `plugin.yaml` и папку `dashboard/`, - в `plugins/hermes-codex-visual/`. Включи агентскую часть для нужного профиля командой `hermes plugins enable hermes-codex-visual`, затем пересканируй плагины интерфейса. Обновляй обе части одновременно. Если старая серверная часть уже загружена, для обновления её кода может потребоваться штатный перезапуск шлюза.

История использования и история лимитов относятся ко всему подключённому аккаунту OpenAI, список чатов - к активному профилю Hermes. Процент чата показывает расход за всё время относительно полного текущего недельного лимита. Отсутствующие и неполные данные отмечаются. Сброс требует отдельного подтверждения; ассистент может только подготовить запрос, а его инструмент появляется в новом чате после включения.
