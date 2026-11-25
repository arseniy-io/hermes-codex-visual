import { russianSystemCopy } from './system-ru-copy.js'

// Hermes 0.23.1 ships the new connectors page in English even for the
// Russian locale. Extend its native catalog so React renders translated
// labels, accessible names and placeholders without rewriting the DOM.
const plural = (n, one, few, many) => {
  const value = Math.abs(Number(n))
  const last = value % 10
  const lastTwo = value % 100
  return last === 1 && lastTwo !== 11 ? one : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many
}
const tools = n => `${n} ${plural(n, 'инструмент', 'инструмента', 'инструментов')}`
const accounts = n => `${n} ${plural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}`

export const russianConnectorsPage = {
  title: 'MCP',
  searchPlaceholder: n => `Поиск приложений (${n})`,
  filterCategory: 'Категория',
  categoryAll: 'Все категории',
  uncategorised: 'Без категории',
  residencyLocal: 'На этом устройстве',
  segment: { all: 'Все', available: 'Доступные', connected: 'Подключённые', off: 'Отключённые' },
  group: {
    connected: 'Подключённые', connectedNote: 'Сначала показаны подключения с ошибками.',
    available: 'Доступные', off: 'Отключённые', offNote: 'Данные для входа сохранены.',
  },
  card: {
    kindManaged: 'Управляемый', kindCatalog: 'MCP · Каталог', kindCustom: 'MCP · Свой',
    kindPlugin: plugin => `MCP · Плагин ${plugin}`,
    inCatalog: 'В каталоге Hermes', hostedTwin: 'Доступна управляемая версия',
    alsoLocal: 'Также работает на этом устройстве', open: name => `Открыть ${name}`,
    turnServerOn: name => `Включить ${name}`, turnServerOff: name => `Выключить ${name}`,
    state: {
      accessExpired: 'Доступ истёк', available: 'Доступно', connected: 'Подключено',
      connecting: 'Подключение', connectionUnknown: 'Состояние неизвестно',
      couldNotConnect: 'Не удалось подключиться', offByYourOrganisation: 'Отключено организацией',
      offForYou: 'Отключено для вас', serverConnecting: 'Подключение…', serverError: 'Ошибка',
      serverNeedsAuth: 'Нужен вход', serverOff: 'Выключен', serverOn: 'Включён',
      serverOnUnused: 'Включён, не используется',
    },
    fact: {
      tools, toolsOff: n => `Отключено: ${tools(n)}`, toolsOn: n => `Включено: ${tools(n)}`,
      toolsSomeOn: (total, on) => `${tools(total)}, включено ${on}`,
    },
    verb: {
      authenticate: 'Войти', connect: 'Подключить', install: 'Установить', openLogs: 'Открыть журнал',
      reconnect: 'Подключить снова', stopWaiting: 'Прекратить ожидание', tryAgain: 'Повторить',
      turnBackOn: 'Включить снова',
    },
    reason: {
      finishSignIn: 'Завершите вход в браузере.', reconnect: 'Подключите приложение снова, чтобы продолжить работу.',
      serverError: 'Сервер отклонил подключение.', serverNeedsAuth: 'Войдите, чтобы сервер мог отвечать.',
    },
  },
  page: {
    loading: 'Загружаем каталог и серверы на этом устройстве',
    emptyTitle: 'Пока нет приложений. Добавьте сервер на этом устройстве.',
    noMatchTitle: 'Приложения не найдены',
    noMatchBody: 'Ничего не найдено. Можно добавить свой сервер MCP.', clearSearch: 'Очистить поиск',
    hostedFailedTitle: 'Не удалось получить приложения из облака.',
    hostedFailedBody: 'Серверы на этом устройстве продолжают работать. Ничего не отключено.',
    retry: 'Повторить', matchesElsewhere: n => `В других группах найдено: ${n}.`,
    showAllMatches: 'Показать все результаты', segmentNoMatch: segment => `В разделе «${segment}» совпадений нет. Показаны все результаты.`,
    freeTierNote: 'До входа подключения сохраняются на этом устройстве.',
    signInLine: 'Войдите в Nous, чтобы использовать управляемые приложения.', signIn: 'Войти',
    managedUnavailable: 'Управляемые приложения пока недоступны для этого аккаунта.',
    writeFailed: 'Не удалось сохранить изменение.', refreshFailed: 'Не удалось обновить список инструментов.',
    disconnectNoAccount: 'Нет аккаунта для отключения. Обновите страницу и попробуйте ещё раз.',
    disconnectRefused: 'Не удалось удалить данные входа. Выключите приложение переключателем или повторите позже.',
  },
  add: {
    action: 'Добавить свой MCP', title: 'Подключить свой сервер MCP', hint: 'Новая запись в mcp.json на этом устройстве',
    pasteLabel: 'Вставьте команду или настройки',
    pastePlaceholder: 'npx -y @modelcontextprotocol/server-filesystem /path/to/dir',
    pasteNoMatch: 'Не удалось распознать сервер. Заполните поля ниже.', name: 'Название',
    nameTaken: 'Это название уже используется.', type: 'Тип', typeStdio: 'STDIO', typeHttp: 'Streamable HTTP',
    command: 'Команда запуска', args: 'Аргументы', addArg: '+ Добавить аргумент',
    envVars: 'Переменные окружения', addEnvVar: '+ Добавить переменную окружения',
    passthrough: 'Передавать переменные окружения', addPassthrough: '+ Добавить переменную',
    cwd: 'Рабочая папка', url: 'URL', headers: 'Заголовки запроса', addHeader: '+ Добавить заголовок',
    auth: 'Авторизация', authNone: 'Без авторизации', authOauth: 'OAuth', authBearer: 'Токен Bearer',
    keyPlaceholder: 'KEY', valuePlaceholder: 'значение', removeRow: 'Удалить строку',
    editJson: 'Изменить mcp.json', saveFailed: 'Не удалось сохранить сервер.',
  },
  dialog: {
    disconnect: 'Отключить', disconnectTitle: name => `Отключить ${name}?`,
    disconnectBody: 'Hermes перестанет работать через этот аккаунт. Его можно подключить снова.',
    menuRefreshTools: 'Обновить список инструментов', moreActions: 'Другие действия',
    removeServerTitle: name => `Удалить ${name}?`,
    removeServerBody: 'Запись будет удалена из mcp.json на этом компьютере. Остальные данные не изменятся.',
    appSwitch: name => `Hermes может использовать ${name}`, waysTitle: name => `Где работает ${name}`,
    wayNotConnected: name => `Пока не подключено. Войдите в ${name} через браузер.`, wayHosted: 'Управляемый',
    bothOn: name => `Оба варианта включены, поэтому инструменты ${name} отображаются дважды.`,
    turnOffLocal: 'Выключить локальный сервер', providedByPlugin: plugin => `Предоставлено плагином ${plugin}`,
    openPlugins: 'Открыть вкладку «Плагины»', nousLine: 'Приложения Nous привязаны к аккаунту, а не к профилю.',
    rulesReadOnly: 'Сейчас нельзя изменить настройки инструментов.',
    rulesAppOff: name => `Включите ${name}, чтобы изменить настройки инструментов.`,
    rulesSignIn: 'Войдите, чтобы изменить доступные действия Hermes.',
    orgNote: n => `Организация отключила инструментов: ${n}.`, orgLink: 'Открыть управление подключениями',
    connectEnded: 'Вход не завершён.', connectOpenAgain: 'Открыть ссылку снова',
    tokensPerCall: 'токенов на вызов', usesPerMonth: 'использований за 30 дней',
    advanced: 'Дополнительно', advancedHint: 'запись в mcp.json и журнал',
  },
  accounts: {
    heading: 'Аккаунты', count: accounts, addAnother: 'Добавить аккаунт', aliasLabel: 'Название аккаунта',
    aliasHint: 'До 32 строчных латинских букв, цифр или дефисов. Например, work или home.',
    aliasInvalid: 'Используйте строчные латинские буквы, цифры и дефисы. Начните с буквы или цифры.',
    aliasTaken: 'Это название уже используется.', add: 'Подключить', rename: 'Переименовать',
    renameLabel: name => `Новое название для ${name}`,
    renameGone: 'Этот аккаунт больше недоступен: его удалили или подключили заново.',
    remove: 'Удалить', removeTitle: (app, name) => `Удалить аккаунт ${name} в ${app}?`,
    removeBody: 'Hermes перестанет работать через этот аккаунт. Другие аккаунты останутся подключены.',
    retiredCount: n => `Заменённых аккаунтов: ${n}`,
    status: { expired: 'Доступ истёк', failed: 'Не удалось подключиться', inactive: 'Неактивен',
      pending: 'Ожидается вход', retired: 'Заменён при повторном подключении', revoked: 'Доступ отозван' },
  },
  tools: {
    title: 'Инструменты', notInstalledBody: 'Установите приложение на этом устройстве, чтобы увидеть его инструменты.',
    summaryTitle: name => `Что Hermes может делать с ${name}`,
    summaryPreviewTitle: name => `Что Hermes сможет делать с ${name} после подключения`,
    summaryCount: tools, summaryAllTools: 'Все инструменты', summaryOther: 'Другое',
    allToolsSwitch: 'Включить или выключить все инструменты', summaryAllOn: 'все включены',
    summarySomeOn: (on, total) => `включено ${on} из ${total}`, summaryOff: 'выключены',
    showAllTools: n => `Показать все инструменты (${n})`, showSummary: 'Показать сводку',
    facetSwitch: facet => `Включить или выключить инструменты «${facet}»`, moreHints: n => `+${n}`,
    staleSignIn: 'Войдите, чтобы получить актуальный список инструментов.',
    searchCountPlaceholder: n => `Поиск инструментов (${n})`, toolList: name => `Инструменты ${name}`,
    categorySelect: n => `Категории: ${n}`, showDeprecated: n => `Показать устаревшие (${n})`,
    hideDeprecated: n => `Скрыть устаревшие (${n})`, quickReadOnly: 'Только чтение',
    quickNoDestructive: 'Отключить необратимые действия', quickEverythingOn: 'Включить всё',
    lockedHint: 'отключено организацией', turnToolOn: tool => `Включить ${tool}`,
    turnToolOff: tool => `Выключить ${tool}`, showDetails: tool => `Показать, что делает ${tool}`,
    hideDetails: tool => `Скрыть описание ${tool}`, noMatch: 'Подходящих инструментов не найдено.',
    loading: 'Загружаем список инструментов', unavailableLine: 'Список инструментов недоступен.',
    needsAuthTitle: name => `Войдите в ${name}, чтобы увидеть инструменты.`,
    needsAuthBody: 'Данные входа остаются на этом устройстве.', retry: 'Повторить',
    goneTitle: name => `${name} больше нет в каталоге.`,
    goneBody: 'Hermes больше не может его вызвать. Запись останется, пока вы её не удалите.', remove: 'Удалить',
    offTitle: name => `${name} выключен.`, offBody: 'Включите сервер переключателем выше, чтобы увидеть инструменты.',
    signedOutTitle: 'Войдите в Nous, чтобы увидеть список инструментов.',
    signedOutBody: 'Серверы на этом устройстве продолжат работать.',
    conflictTitle: 'Пока вы меняли настройки, их изменил кто-то ещё.',
    conflictBody: (off, on) => `Другие изменения: выключено ${off}, включено ${on}. Ваши правки остались на экране и ещё не сохранены.`,
    conflictReload: 'Загрузить другую версию', conflictSave: 'Сохранить свои изменения',
    saveFailed: 'Не удалось сохранить настройки инструментов.',
    footerDirty: (off, on) => `Выключено: ${off}, включено снова: ${on}`,
    discard: 'Отменить изменения', save: 'Сохранить изменения', saving: 'Сохраняем…',
  },
  vocabulary: {
    facetRead: { label: 'Чтение', long: 'Читает данные приложения, ничего не меняя.' },
    facetWrite: { label: 'Изменение', long: 'Создаёт или изменяет данные в приложении.' },
    facetDestructive: { label: 'Необратимые', long: 'Может безвозвратно удалить данные в приложении.' },
    facetUnclassified: { label: 'Действие неизвестно', long: 'Приложение не сообщило, что делает инструмент.' },
    hintReadOnly: { label: 'Только чтение', long: 'Инструмент сообщает, что только читает данные.' },
    hintCreate: { label: 'Создание', long: 'Создаёт новые данные.' },
    hintUpdate: { label: 'Изменение', long: 'Изменяет существующие данные.' },
    hintDelete: { label: 'Удаление', long: 'Удаляет данные.' },
    hintDestructive: { label: 'Необратимо', long: 'Это изменение нельзя отменить здесь.' },
    hintIdempotent: { label: 'Повторяемое', long: 'Повторный запуск даёт тот же результат.' },
    hintOpenWorld: { label: 'Внешнее', long: 'Обращается за пределы приложения.' },
  },
}

export function registerMcpRussian(ctx) {
  ctx.i18n.registerAppLocale('ru', { translations: {
    ...russianSystemCopy,
    connectorsPage: russianConnectorsPage,
    // The adjacent tab is visible on the MCP page too.
    skills: { ...russianSystemCopy.skills, tabPlugins: 'Плагины' },
  } })
}
