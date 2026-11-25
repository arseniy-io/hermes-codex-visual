// Exact descriptions shipped by the Hermes catalog. Matching the full text
// prevents an old translation from misrepresenting a changed server entry.
// Names, links and arbitrary descriptions supplied by servers are untouched.
const descriptions = new Map(Object.entries({
  'Bases, tables, and records from your Airtable workspace.': 'Базы, таблицы и записи из рабочего пространства Airtable.',
  'Algolia search: indices, analytics, and settings (read-only).': 'Поиск Algolia: индексы, аналитика и настройки (только чтение).',
  'AllTrails: find hikes and trails with reviews and ratings.': 'AllTrails: поиск маршрутов с отзывами и оценками.',
  'Amplitude analytics: charts, dashboards, experiments, flags.': 'Аналитика Amplitude: графики, панели, эксперименты и флаги функций.',
  'Tasks, projects, and goals from your Asana workspace.': 'Задачи, проекты и цели из рабочего пространства Asana.',
  "Jira issues and Confluence pages via Atlassian's hosted remote MCP.": 'Задачи Jira и страницы Confluence через сервер Atlassian.',
  'CRM records, lists, and notes in Attio.': 'Записи, списки и заметки в Attio CRM.',
  'Authoritative AWS docs, API references, and best practices.': 'Официальная документация AWS, справка по API и рекомендации.',
  'Better Stack: logs, uptime monitors, incidents, and status pages.': 'Better Stack: журналы, проверка доступности, происшествия и страницы состояния.',
  'CI/CD pipelines, builds, and test results from Buildkite.': 'Процессы сборки, сборки и результаты проверок в Buildkite.',
  'Scheduling links, events, and invitees from Calendly.': 'Ссылки для записи, события и приглашённые в Calendly.',
  'Create, search, and manage Canva designs.': 'Создание, поиск и управление дизайнами в Canva.',
  'CircleCI: diagnose build failures, read logs, rerun workflows.': 'CircleCI: поиск причин ошибок сборки, чтение журналов и повторный запуск процессов.',
  'Tasks, docs, and workspaces in ClickUp.': 'Задачи, документы и рабочие пространства в ClickUp.',
  'Sales CRM: leads, opportunities, calls, and emails.': 'CRM для продаж: клиенты, сделки, звонки и письма.',
  'Full Cloudflare API access via the official remote MCP.': 'Полный доступ к API Cloudflare через официальный сервер MCP.',
  'Upload, search, and transform media assets in Cloudinary.': 'Загрузка, поиск и обработка медиафайлов в Cloudinary.',
  'Generate images, video, audio, and 3D on Comfy Cloud.': 'Создание изображений, видео, аудио и 3D в Comfy Cloud.',
  'Up-to-date, version-specific library docs and code examples.': 'Актуальная документация библиотек и примеры кода с учётом версии.',
  'Craft: structured docs, tasks, and personal knowledge base.': 'Craft: документы, задачи и личная база знаний.',
  'Logs, monitors, dashboards, and incidents from Datadog.': 'Журналы, мониторинг, панели и происшествия в Datadog.',
  "Ask questions about any public GitHub repo (Devin's DeepWiki).": 'Вопросы о любом публичном репозитории GitHub через DeepWiki от Devin.',
  'Search, read, and manage files in Dropbox.': 'Поиск, чтение и управление файлами в Dropbox.',
  'Official Figma remote MCP — design context, Code Connect, and write-to-canvas via https://mcp.figma.com/mcp (OAuth).': 'Официальный сервер Figma MCP: контекст дизайна, Code Connect и запись на холст через https://mcp.figma.com/mcp (OAuth).',
  'Meeting transcripts, summaries, and action items.': 'Расшифровки встреч, краткие итоги и задачи.',
  'Gamma: generate and edit AI presentations, docs, and sites.': 'Gamma: создание и редактирование презентаций, документов и сайтов с помощью ИИ.',
  'GitLab: issues, merge requests, pipelines, and repo context.': 'GitLab: задачи, запросы на объединение, процессы сборки и сведения о репозитории.',
  'Ping, traceroute, DNS, and HTTP tests from global probes.': 'Проверка Ping, traceroute, DNS и HTTP из разных точек мира.',
  'Query metrics, logs, dashboards, alerts, and incidents from Grafana Cloud.': 'Запрос метрик, журналов, панелей, предупреждений и происшествий из Grafana Cloud.',
  'Models, datasets, Spaces, and papers from the Hugging Face Hub.': 'Модели, наборы данных, Spaces и статьи из Hugging Face Hub.',
  'Search jobs and listings on Indeed.': 'Поиск вакансий и объявлений на Indeed.',
  'Conversations, tickets, and customer data from Intercom.': 'Переписки, обращения и данные клиентов в Intercom.',
  'Kiwi.com flight search: itineraries with direct booking links.': 'Поиск авиабилетов Kiwi.com: маршруты с прямыми ссылками на бронирование.',
  'Klaviyo marketing: campaigns, flows, segments, and reporting.': 'Маркетинг в Klaviyo: кампании, цепочки, сегменты и отчёты.',
  'Find, create, and update Linear issues, projects, and comments.': 'Поиск, создание и изменение задач, проектов и комментариев в Linear.',
  'Official Microsoft, Azure, and .NET docs and code samples.': 'Официальная документация и примеры кода Microsoft, Azure и .NET.',
  'Read and edit Miro boards, diagrams, and frames.': 'Чтение и изменение досок, схем и фреймов в Miro.',
  'Mixpanel analytics: events, funnels, retention, dashboards.': 'Аналитика Mixpanel: события, воронки, удержание и панели.',
  'Boards, items, docs, and workflows in monday.com.': 'Доски, элементы, документы и рабочие процессы в monday.com.',
  'MotherDuck: query DuckDB cloud warehouses with SQL.': 'MotherDuck: SQL-запросы к облачным хранилищам DuckDB.',
  "Connect to your n8n instance's official MCP server with browser OAuth.": 'Подключение к официальному серверу MCP вашего n8n через OAuth в браузере.',
  'Neon serverless Postgres: projects, branches, and SQL.': 'Бессерверный Postgres Neon: проекты, ветки и SQL.',
  "Sites, deploys, and env vars via Netlify's hosted MCP.": 'Сайты, развёртывания и переменные окружения через сервер Netlify MCP.',
  'Pages and databases from your Notion workspace.': 'Страницы и базы данных рабочего пространства Notion.',
  "Payments, invoices, and subscriptions via PayPal's hosted MCP.": 'Платежи, счета и подписки через сервер PayPal MCP.',
  'Plaid dashboard: integrations, Items, and usage debugging.': 'Панель Plaid: интеграции, Items и диагностика использования.',
  'Postman workspaces, collections, environments, and APIs.': 'Рабочие пространства, коллекции, окружения и API в Postman.',
  'Create and manage Prisma Postgres databases.': 'Создание баз Prisma Postgres и управление ими.',
  'Railway: projects, services, deployments, and environments.': 'Railway: проекты, сервисы, развёртывания и окружения.',
  'Find people and manage real-world work through RentAHuman.': 'Поиск людей и управление работой в реальном мире через RentAHuman.',
  'Robinhood agentic trading: portfolio, balances, and orders.': 'Торговые действия Robinhood: портфель, балансы и заявки.',
  'Scan code for security vulnerabilities with Semgrep.': 'Проверка кода на уязвимости с помощью Semgrep.',
  'Issues, stack traces, and error context from Sentry.': 'Ошибки, трассировки и сведения о сбоях из Sentry.',
  "Catalog, orders, and payments via Square's hosted MCP.": 'Каталог, заказы и платежи через сервер Square MCP.',
  'Strava: activities, fitness trends, training load (read-only).': 'Strava: активность, показатели формы и нагрузка на тренировках (только чтение).',
  "Payments, customers, and invoices via Stripe's hosted MCP.": 'Платежи, клиенты и счета через сервер Stripe MCP.',
  'Database, auth, and storage from your Supabase projects.': 'База данных, авторизация и хранилище проектов Supabase.',
  'Manage Todoist tasks and projects.': 'Управление задачами и проектами в Todoist.',
  'trivago hotel search: compare prices by city and dates.': 'Поиск отелей trivago: сравнение цен по городу и датам.',
  'Stocks, forex, and crypto market data from Twelve Data.': 'Данные об акциях, валютном и криптовалютном рынках от Twelve Data.',
  'Twilio developer docs search (public beta, read-only).': 'Поиск по документации Twilio для разработчиков (открытое тестирование, только чтение).',
  'Drive the Unreal Engine 5.8 editor over its local MCP server.': 'Управление редактором Unreal Engine 5.8 через локальный сервер MCP.',
  "Deployments, logs, and projects via Vercel's hosted MCP.": 'Развёртывания, журналы и проекты через сервер Vercel MCP.',
  "Sites, CMS collections, and pages via Webflow's hosted MCP.": 'Сайты, коллекции CMS и страницы через сервер Webflow MCP.',
  'Wolfram|Alpha computation, math, and curated knowledge.': 'Вычисления, математика и проверенные знания Wolfram|Alpha.',
  'WordPress.com: posts, pages, drafts, stats, and comments.': 'WordPress.com: записи, страницы, черновики, статистика и комментарии.',

  'Read and edit bases, tables, and records': 'Чтение и изменение баз, таблиц и записей',
  'Find contacts and manage outreach': 'Поиск контактов и работа с обращениями',
  'Read and manage tasks and projects': 'Чтение задач и проектов и управление ими',
  'Read and manage candidates, jobs, and interviews': 'Работа с кандидатами, вакансиями и собеседованиями',
  'Investigate monitors, incidents, and logs': 'Изучение мониторинга, происшествий и журналов',
  'Find, read, and manage files and folders': 'Поиск, чтение и управление файлами и папками',
  'Read bookings and manage scheduling links': 'Просмотр бронирований и управление ссылками для записи',
  'Find, create, and edit designs': 'Поиск, создание и изменение дизайнов',
  'Query ClickHouse Cloud data': 'Запрос данных ClickHouse Cloud',
  'Manage zones, DNS, Workers, and storage': 'Управление зонами, DNS, Workers и хранилищем',
  'Search, read, and write wiki pages': 'Поиск, чтение и создание страниц базы знаний',
  'Manage people, campaigns, and broadcasts': 'Управление контактами, кампаниями и рассылками',
  'Investigate metrics, logs, incidents, and dashboards': 'Изучение метрик, журналов, происшествий и панелей',
  'Post and moderate in a server as a bot': 'Публикация и модерация на сервере от имени бота',
  'Search meeting notes and transcripts': 'Поиск по заметкам и расшифровкам встреч',
  'Read conversations, contacts, and help articles': 'Чтение переписок, контактов и справочных статей',
  'Search, create, and update issues': 'Поиск, создание и изменение задач',
  'Search, create, and update issues and projects': 'Поиск, создание и изменение задач и проектов',
  'Run questions and read dashboards': 'Запуск запросов и просмотр панелей',
  'Search and read product documentation': 'Поиск и чтение документации продукта',
  'Manage Postgres projects and branches, and run SQL': 'Управление проектами и ветками Postgres, выполнение SQL-запросов',
  'Search, read, and edit pages and databases': 'Поиск, чтение и изменение страниц и баз данных',
  'Create, send, and track documents': 'Создание, отправка и отслеживание документов',
  'Look up people and company records': 'Поиск сведений о людях и компаниях',
  'Read and answer customer support threads': 'Чтение обращений в поддержку и ответы на них',
  'Query product analytics and feature flags': 'Запрос продуктовой аналитики и флагов функций',
  'Manage projects, services, and deployments': 'Управление проектами, сервисами и развёртываниями',
  'Send and manage transactional email': 'Отправка и управление служебными письмами',
  'Research keywords, domains, and competitors': 'Исследование поисковых запросов, доменов и конкурентов',
  'Send email and manage lists and templates': 'Отправка писем и управление списками и шаблонами',
  'Investigate issues, events, and releases': 'Изучение ошибок, событий и выпусков',
  'Manage products, orders, and customers': 'Управление товарами, заказами и клиентами',
  'Read and post messages, and search channels': 'Чтение и публикация сообщений, поиск по каналам',
  'Read and manage customers, products, and payments': 'Чтение и управление клиентами, товарами и платежами',
  'Manage projects, databases, and functions': 'Управление проектами, базами данных и функциями',
  'Manage SQLite databases and groups': 'Управление базами SQLite и группами',
  'Manage projects and deployments, and read logs': 'Управление проектами и развёртываниями, чтение журналов',
}))

export function translateMcpCatalogDescription(value) {
  if (descriptions.has(value)) return descriptions.get(value)
  const generic = /^Use ([^\n]{1,80}) through Hermes$/.exec(value)
  return generic ? `Работа с ${generic[1]} через Hermes` : value
}

export function translateMcpMetric(value) {
  const metric = /^(?:\d+(?:\.\d+)?[kmb]? (?:использований за 30 дней|токенов на вызов))(?: · \d+(?:\.\d+)?[kmb]? (?:использований за 30 дней|токенов на вызов))?$/i
  if (!metric.test(value)) return value
  return value.replace(/(\d+(?:\.\d+)?)([kmb])(?= (?:использований за 30 дней|токенов на вызов))/gi,
    (_, number, suffix) => `${number.replace('.', ',')} ${{ k: 'тыс.', m: 'млн', b: 'млрд' }[suffix.toLowerCase()]}`)
}

export function registerMcpCatalogRussian(ctx) {
  const root = document.documentElement
  const target = '[data-slot="connector-row-card"] p.line-clamp-2, [data-slot="dialog-content"] [data-slot="dialog-description"], [data-slot="dialog-content"] p'
  const changes = new Map()
  let watching = false

  function update(element) {
    if (!element.isConnected || element.childElementCount || element.childNodes.length !== 1) return
    const node = element.firstChild
    if (!node || node.nodeType !== Node.TEXT_NODE) return
    const previous = changes.get(node)
    if (previous?.shown === node.data) return
    if (previous) changes.delete(node)
    const original = node.data
    const shown = translateMcpMetric(translateMcpCatalogDescription(original))
    if (shown === original) return
    changes.set(node, { original, shown })
    node.data = shown
  }

  function visit(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    if (!element?.isConnected) return
    // Individual tools are supplied by servers, not by the catalog. A large
    // tool list can change on every scroll, so don't traverse those rows.
    if (element.closest('[data-slot="tools-list"], [data-slot="tools-summary"]')) return
    if (element.matches(target)) update(element)
    if (node.nodeType === Node.ELEMENT_NODE) element.querySelectorAll(target).forEach(update)
  }

  const content = new MutationObserver(records => {
    let removed = false
    for (const record of records) {
      if (record.type === 'characterData') visit(record.target)
      else {
        removed ||= record.removedNodes.length > 0
        for (const node of record.addedNodes) visit(node)
      }
    }
    if (removed) for (const node of changes.keys()) if (!node.isConnected) changes.delete(node)
  })

  function stop() {
    content.disconnect()
    for (const [node, { original, shown }] of changes) if (node.data === shown) node.data = original
    changes.clear()
  }

  function sync() {
    const enabled = /^ru(?:-|$)/i.test(root.lang) && /^#\/capabilities(?:[/?#]|$)/.test(location.hash)
    if (enabled === watching) return
    watching = enabled
    if (enabled) {
      visit(document.body)
      content.observe(document.body, { childList: true, subtree: true, characterData: true })
    } else stop()
  }

  const language = new MutationObserver(sync)
  language.observe(root, { attributes: true, attributeFilter: ['lang'] })
  ctx.addEventListener(window, 'hashchange', sync)
  ctx.addEventListener(window, 'popstate', sync)
  if (window.navigation) ctx.addEventListener(window.navigation, 'currententrychange', sync)
  ctx.onDispose(() => { language.disconnect(); stop() })
  sync()
}
