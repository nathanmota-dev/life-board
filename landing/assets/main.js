/*
 * Life Board landing page: language, accent color, latest release and the interactive app replicas.
 * Portuguese lives in the HTML; English lives in EN below. Demo content lives in DEMO.
 */
(function () {
  "use strict";

  var REPO = "nathanmota-dev/life-board";
  var RELEASES_URL = "https://github.com/" + REPO + "/releases/latest";
  var LANG_KEY = "lb-landing-lang";
  var ACCENT_KEY = "lb-landing-accent";
  var RELEASE_KEY = "lb-landing-release";
  var RELEASE_TTL = 60 * 60 * 1000;

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (error) {
      return null;
    }
    return null;
  }

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $all(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
  function demo(name) { return $('[data-demo="' + name + '"]'); }
  function icon(name, extra) { return '<svg class="icon ' + (extra || "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  /* ---------------------------------------------------------------- i18n */

  var EN = {
    "meta.title": "Life Board: your personal dashboard for Linux",
    "meta.description": "Life Board brings tasks, calendar, goals, habits and GitHub together in a desktop app for Linux. Your data stays on your computer.",
    "skip": "Skip to content",
    "nav.label": "Main",
    "nav.features": "Features",
    "nav.privacy": "Privacy",
    "nav.install": "Install",
    "nav.github": "Life Board on GitHub",
    "lang.label": "Language",
    "hero.title": "Your whole life on <em>one board</em>.",
    "hero.lead": "Tasks, calendar, goals, habits and GitHub together in one app for Linux. Everything is stored on your computer, no account needed.",
    "hero.download": "Download for Linux",
    "hero.howto": "How to install",
    "hero.release": "Version",
    "hero.notes": "release notes",
    "hero.appimage": "AppImage",
    "hero.meta1": "Linux x64: Ubuntu, Debian and derivatives",
    "hero.meta2": "Free and open source (MIT)",
    "hero.demoLabel": "Interactive demo of the Life Board dashboard",
    "app.search": "Search anything...",
    "app.workspace": "Workspace",
    "app.myDay": "My day",
    "app.tryIt": "Click the ring",
    "mod.dashboard": "Dashboard",
    "mod.inbox": "Inbox",
    "mod.tasks": "Tasks",
    "mod.calendar": "Calendar",
    "mod.goals": "Goals",
    "mod.habits": "Habits",
    "mod.settings": "Settings",
    "mod.projects": "Projects",
    "mod.thoughts": "Thoughts",
    "mod.pages": "Pages",
    "mod.files": "Files",
    "mod.mood": "Mood",
    "mod.activity": "Activity",
    "mod.tags": "Tags",
    "video.label": "Life Board demo video",
    "features.eyebrow": "All in one place",
    "features.title": "One app instead of many",
    "features.lead": "Each part of your routine has its own screen, and they all talk to each other: a task joins a goal, an event shows up on the dashboard, a thought becomes a task.",
    "f.dashboard": "Your day at a glance: calendar, focus, habits, mood and goals in widgets you arrange.",
    "f.tasks": "Everything you need to get done, by when it matters, with priority, tags and a board or list view.",
    "f.calendar": "Your week at a glance, with two-way sync with Google Calendar.",
    "f.goals": "Short and long-term goals broken into milestones, with linked tasks and habits.",
    "f.habits": "Drink water, read, tidy the house: an emoji, a daily target and your streak history.",
    "f.projects": "Ideas and projects as a board. Drag a card to another column to change its status.",
    "f.inbox": "Capture first, sort it out later. A global shortcut opens quick capture from anywhere.",
    "f.thoughts": "Ideas, notes and anything worth remembering, as cards you pin and link to tasks.",
    "f.github": "Pull requests and issues to follow up on, and your contributions.",
    "f.pomodoro": "Focus and break cycles, with a clock and the weather in a status bar.",
    "f.pages": "Markdown pages with a formatted editor, organized in folders.",
    "f.files": "Receipts, photos and documents organized in folders, with previews.",
    "f.mood": "A daily check-in on how you're feeling, with a note about the day.",
    "f.activity": "What you've been up to lately, in a single history.",
    "f.tags": "Everything you labelled across tasks and thoughts, grouped by tag.",
    "f.searchTitle": "Quick search",
    "f.search": "Press Ctrl K to find any page or command without leaving the keyboard.",
    "spot.label": "Features in detail",
    "dash.title": "Your day at a glance",
    "dash.lead": "The dashboard brings together today's calendar, the focus of the day, habits, mood and active goals, and you arrange the widgets your way.",
    "dash.p1": "A timeline of the day, with the next appointment highlighted",
    "dash.p2": "Log a habit with a single click",
    "dash.p3": "Show, hide and reorder widgets",
    "dash.note": "Try it: click the rings to log a habit.",
    "cap.title": "Capture now, sort it out later",
    "cap.lead": "Had an idea in the middle of something else? Press the global shortcut, type it and get back to what you were doing. The capture waits in the inbox until you decide what to do with it.",
    "cap.p1": "<span class=\"kbd\">Ctrl</span> <span class=\"kbd\">Shift</span> <span class=\"kbd\">Space</span> opens capture from anywhere",
    "cap.p2": "Choose whether it's a task or a thought",
    "cap.p3": "Later, plan it, archive it or turn it into something else",
    "cap.quick": "Quick capture",
    "cap.as": "Capture as",
    "cap.task": "Task",
    "cap.thought": "Thought",
    "cap.inputLabel": "Capture text",
    "cap.placeholder": "Something you need to do…",
    "cap.submit": "Capture",
    "cap.toTriage": "To triage",
    "cap.note": "Try it: type something and press Enter. Use #tag to add a tag.",
    "tasks.title": "What matters today, without losing the rest",
    "tasks.lead": "Filter by today, upcoming, someday or overdue. Set priority, due date and tags, and pick up to three tasks as the focus of the day on the dashboard.",
    "tasks.p1": "Board or list view",
    "tasks.p2": "Tasks linked to goals, projects and events",
    "tasks.p3": "Notifications for what's due",
    "tasks.filters": "Task filters",
    "tasks.note": "Check a task and watch the filters update.",
    "cal.title": "Your Google calendar, inside the board",
    "cal.lead": "Connect Google Calendar and the events from your primary calendar show up on the calendar and the dashboard. Create, move or edit them in Life Board and the change goes back to Google within seconds.",
    "cal.p1": "Two-way sync, every 15 minutes or on demand",
    "cal.p2": "Drag to move and resize events",
    "cal.p3": "Sign in through your browser, and revoke access whenever you want",
    "cal.synced": "Google Calendar synced",
    "cal.weekLabel": "Sample week",
    "goals.title": "Big goals, one step at a time",
    "goals.lead": "Break each goal into dated milestones, link tasks and habits, and follow progress and the risk of slipping on a timeline.",
    "goals.p1": "Areas such as health, career and learning",
    "goals.p2": "Progress calculated from milestones, tasks and habits",
    "goals.p3": "Active goals always in view on the dashboard",
    "goals.note": "Complete a milestone to watch the progress go up.",
    "pomo.title": "Focus with an end in sight",
    "pomo.lead": "Focus and break cycles that carry on even after the app restarts, with a clock and the weather in a status bar.",
    "pomo.phase": "Timer phase",
    "pomo.reset": "Reset",
    "gh.title": "Your pull requests, next to your life",
    "gh.lead": "Follow the pull requests and issues waiting on you and see your contributions, with a token that stays encrypted on your computer.",
    "custom.eyebrow": "Your way",
    "custom.title": "A workspace that feels like yours",
    "custom.lead": "Pick the accent color, the language and the dashboard widgets. The color changes buttons, charts and highlights across the whole app.",
    "custom.accent": "Accent color",
    "custom.accentLead": "Try it here: this page uses the same colors as the app.",
    "custom.newTask": "New task",
    "custom.badge": "In progress",
    "custom.lang": "Portuguese and English",
    "custom.langLead": "The interface follows your system language, and you can switch whenever you want. Try it:",
    "custom.kb": "Built for the keyboard",
    "custom.kbLead": "Ctrl K opens search to jump to any page or run a command.",
    "priv.title": "Your data stays on your computer",
    "priv.lead": "Life Board has no server and no account. The whole app runs on your machine and only connects to services you turn on yourself.",
    "priv.c1t": "Local storage",
    "priv.c1": "Tasks, goals, habits, pages and files live in a SQLite database in <code>~/.config/life-board-app</code>.",
    "priv.c2t": "Encrypted credentials",
    "priv.c2": "GitHub and Google tokens are encrypted with AES-256-GCM, with the key protected by the system keyring.",
    "priv.c3t": "No tracking",
    "priv.c3": "No ads, no usage analytics and no telemetry. The code is open source under the MIT license.",
    "priv.link": "Read the privacy policy",
    "inst.title": "Install on Linux in a minute",
    "inst.lead": "Life Board ships for Linux x64 in two formats, with the same app and the same data. The commands below already use the latest version.",
    "inst.format": "Package format",
    "inst.deb": ".deb (recommended)",
    "inst.deb1t": "Download the package",
    "inst.deb1": "File",
    "inst.downloadDeb": "Download .deb",
    "inst.deb2t": "Install it with APT, from the download folder",
    "inst.deb2": "The <code>./</code> is required: it marks a local file and makes APT install the dependencies too.",
    "inst.deb3t": "Open Life Board",
    "inst.deb3": "Look for <strong>Life Board</strong> in your applications menu. You don't need Node.js, npm or Git.",
    "inst.oneLiner": "Or download and install in a single command",
    "inst.copy": "Copy command",
    "inst.copied": "Copied",
    "inst.ai1t": "Download the AppImage",
    "inst.downloadAppImage": "Download AppImage",
    "inst.ai2t": "Keep it in a fixed path",
    "inst.ai2": "A fixed path keeps in-app updates and start-on-login working.",
    "inst.ai3t": "Open the app",
    "inst.ai3": "The AppImage needs FUSE (on Ubuntu 22.04 or later, the <code>libfuse2</code> or <code>libfuse2t64</code> package) and doesn't add a menu shortcut.",
    "inst.reqT": "Requirements",
    "inst.req1": "Linux x64: Debian, Ubuntu or a derivative. Tested on Ubuntu 22.04, 24.04 and 26.04 and on Debian 12 and 13.",
    "inst.req2": "An unlocked system keyring, such as GNOME Keyring or KWallet.",
    "inst.req3": "No official packages for Windows, macOS, ARM, Snap, Flatpak or RPM for now.",
    "inst.updT": "Updates",
    "inst.upd": "The app checks for new versions once a day. In <strong>Settings → Updates</strong>, you choose when to download and install. Your data is kept.",
    "inst.remove": "To remove it: <code>sudo apt remove life-board</code>. Your data is not deleted.",
    "inst.guideT": "Full guide",
    "inst.guide": "Migration, backing up your data, a shortcut for the AppImage and installing from source.",
    "inst.guideLink": "Open the installation guide",
    "cta.title": "Ready to organize your routine?",
    "cta.lead": "Free, open source and made for Linux.",
    "cta.all": "All versions",
    "footer.tagline": "A personal dashboard to organize your life in one place.",
    "footer.label": "Footer",
    "footer.product": "Product",
    "footer.releases": "Releases",
    "footer.project": "Project",
    "footer.source": "Source code",
    "footer.issues": "Report an issue",
    "footer.docs": "Documentation",
    "footer.legal": "Legal",
    "footer.privacy": "Privacy policy",
    "footer.terms": "Terms of use",
    "footer.license": "MIT license",
    "footer.local": "Made for Linux. Your data stays with you.",
    "legal.back": "Back to home",
    "legal.privacyTitle": "Privacy policy · Life Board",
    "legal.termsTitle": "Terms of use · Life Board"
  };

  var DEMO = {
    pt: {
      latest: "mais recente",
      greeting: ["Bom dia", "Boa tarde", "Boa noite"],
      stats: [
        ["list-todo", "Tarefas para hoje", "Planejadas, a vencer ou atrasadas"],
        ["list-checks", "Hábitos", "Metas diárias atingidas hoje"],
        ["calendar-days", "Próximos 7 dias", "No calendário"],
        ["smile", "Humor", "Registrado hoje"]
      ],
      tasksCount: function (n) { return n === 1 ? "1 tarefa" : n + " tarefas"; },
      habitsCount: function (done, total) { return done + " de " + total + " concluídos"; },
      eventsCount: "6 eventos",
      mood: "🙂 Bom",
      now: "Agora · ",
      happening: "Agora",
      inMinutes: function (m) { return m >= 60 ? "em " + Math.floor(m / 60) + " h" : "em " + m + " min"; },
      events: [["Reunião de planejamento", "Online"], ["Consulta no dentista", "Centro"], ["Academia", ""]],
      habits: [["💧", "Beber água", "ml"], ["📚", "Ler", "páginas"], ["🧘", "Meditar", "sessão"]],
      goalMet: "Meta atingida",
      addAmount: function (a, u) { return "+" + a + " " + u + " por registro"; },
      logHabit: function (n) { return "Registrar " + n; },
      undoHabit: function (n) { return "Desfazer " + n; },
      captureSeed: [["task", "Pagar a conta de luz", ["casa"]], ["thought", "Presente para o aniversário da Ana", []], ["task", "Renovar a CNH", ["documentos"]]],
      task: "Tarefa",
      thought: "Ideia",
      justNow: "agora",
      today: "hoje",
      capturePlaceholder: { task: "Algo que você precisa fazer…", thought: "Uma ideia que você não quer perder…" },
      filters: { all: "Todas", today: "Hoje", upcoming: "Próximas", done: "Concluídas" },
      tasks: [
        ["Enviar o relatório mensal", "today", "high", ["trabalho"]],
        ["Comprar ração do gato", "today", null, ["casa"]],
        ["Pagar o cartão de crédito", "overdue", "high", ["finanças"]],
        ["Agendar revisão do carro", "upcoming", "medium", []],
        ["Ler o capítulo 4 de “Hábitos Atômicos”", "upcoming", null, ["leitura"]],
        ["Organizar as fotos da viagem", "upcoming", null, ["viagem"]]
      ],
      due: { today: "hoje", overdue: "atrasada · ontem", upcoming: "em 3 dias" },
      priority: { high: "Alta", medium: "Média" },
      emptyFilter: "Nada por aqui. Escolha outro filtro.",
      weekdays: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
      week: [
        [["09:00", "Daily do time", "blue"], ["19:00", "Inglês", "purple"]],
        [["07:00", "Corrida", "green"], ["14:00", "Dentista", "red"]],
        [["09:00", "Daily do time", "blue"], ["12:30", "Almoço com a Bia", "orange"]],
        [["07:00", "Corrida", "green"], ["16:00", "Revisão de PR", "blue"], ["19:00", "Inglês", "purple"]],
        [["09:00", "Daily do time", "blue"], ["20:00", "Cinema", "yellow"]],
        [["08:00", "Feira", "green"], ["15:00", "Aniversário", "orange"]],
        [["10:00", "Faxina da casa", "yellow"]]
      ],
      goal: {
        title: "Correr uma meia maratona",
        why: "Voltar a ter fôlego e fazer uma prova até o fim do ano.",
        domain: "Saúde",
        risk: "Em risco",
        progress: "Progresso",
        until: "até",
        milestones: ["Correr 5 km sem parar", "Correr 10 km", "Treinar 15 km", "Fazer a prova de 21 km"],
        habit: "🏃 Correr 3x por semana",
        tasks: "2 tarefas vinculadas"
      },
      phases: { focus: "Foco", short: "Pausa curta", long: "Pausa longa" },
      ready: "Pronto quando você estiver",
      paused: "Pausado",
      endsAt: function (t) { return "Termina às " + t; },
      session: "Sessão 1 de 4",
      start: "Iniciar",
      pause: "Pausar",
      resume: "Retomar",
      gh: [
        ["git-pull-request", "open", "feat: adicionar revisão semanal", "voce/side-project", "Revisão solicitada", "warning"],
        ["git-merge", "merged", "fix: calendário vazio no primeiro acesso", "voce/dotfiles", "Integrado", "brand"],
        ["circle-dot", "open", "Tema escuro na tela de configurações", "voce/side-project", "Aberto", "success"]
      ],
      accents: ["Laranja", "Rosa", "Violeta", "Azul", "Verde", "Grafite"]
    },
    en: {
      latest: "latest",
      greeting: ["Good morning", "Good afternoon", "Good evening"],
      stats: [
        ["list-todo", "Tasks for today", "Planned, due or overdue"],
        ["list-checks", "Habits", "Daily goals met today"],
        ["calendar-days", "Next 7 days", "On the calendar"],
        ["smile", "Mood", "Checked in today"]
      ],
      tasksCount: function (n) { return n === 1 ? "1 task" : n + " tasks"; },
      habitsCount: function (done, total) { return done + " of " + total + " completed"; },
      eventsCount: "6 events",
      mood: "🙂 Good",
      now: "Now · ",
      happening: "Now",
      inMinutes: function (m) { return m >= 60 ? "in " + Math.floor(m / 60) + " h" : "in " + m + " min"; },
      events: [["Planning meeting", "Online"], ["Dentist appointment", "Downtown"], ["Gym", ""]],
      habits: [["💧", "Drink water", "ml"], ["📚", "Read", "pages"], ["🧘", "Meditate", "session"]],
      goalMet: "Goal met",
      addAmount: function (a, u) { return "+" + a + " " + u + " per log"; },
      logHabit: function (n) { return "Log " + n; },
      undoHabit: function (n) { return "Undo " + n; },
      captureSeed: [["task", "Pay the electricity bill", ["home"]], ["thought", "Birthday gift for Ana", []], ["task", "Renew driver's license", ["documents"]]],
      task: "Task",
      thought: "Thought",
      justNow: "just now",
      today: "today",
      capturePlaceholder: { task: "Something you need to do…", thought: "A thought you don't want to lose…" },
      filters: { all: "All", today: "Today", upcoming: "Upcoming", done: "Done" },
      tasks: [
        ["Send the monthly report", "today", "high", ["work"]],
        ["Buy cat food", "today", null, ["home"]],
        ["Pay the credit card", "overdue", "high", ["finance"]],
        ["Book a car service", "upcoming", "medium", []],
        ["Read chapter 4 of “Atomic Habits”", "upcoming", null, ["reading"]],
        ["Sort the trip photos", "upcoming", null, ["travel"]]
      ],
      due: { today: "today", overdue: "overdue · yesterday", upcoming: "in 3 days" },
      priority: { high: "High", medium: "Medium" },
      emptyFilter: "Nothing here. Pick another filter.",
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      week: [
        [["09:00", "Team stand-up", "blue"], ["19:00", "English class", "purple"]],
        [["07:00", "Run", "green"], ["14:00", "Dentist", "red"]],
        [["09:00", "Team stand-up", "blue"], ["12:30", "Lunch with Bia", "orange"]],
        [["07:00", "Run", "green"], ["16:00", "PR review", "blue"], ["19:00", "English class", "purple"]],
        [["09:00", "Team stand-up", "blue"], ["20:00", "Movies", "yellow"]],
        [["08:00", "Farmers market", "green"], ["15:00", "Birthday party", "orange"]],
        [["10:00", "House cleaning", "yellow"]]
      ],
      goal: {
        title: "Run a half marathon",
        why: "Get my stamina back and finish a race by the end of the year.",
        domain: "Health",
        risk: "At risk",
        progress: "Progress",
        until: "by",
        milestones: ["Run 5 km non-stop", "Run 10 km", "Train for 15 km", "Run the 21 km race"],
        habit: "🏃 Run 3 times a week",
        tasks: "2 linked tasks"
      },
      phases: { focus: "Focus", short: "Short break", long: "Long break" },
      ready: "Ready when you are",
      paused: "Paused",
      endsAt: function (t) { return "Ends at " + t; },
      session: "Session 1 of 4",
      start: "Start",
      pause: "Pause",
      resume: "Resume",
      gh: [
        ["git-pull-request", "open", "feat: add weekly review", "you/side-project", "Review requested", "warning"],
        ["git-merge", "merged", "fix: empty calendar on first launch", "you/dotfiles", "Merged", "brand"],
        ["circle-dot", "open", "Dark theme on the settings page", "you/side-project", "Open", "success"]
      ],
      accents: ["Orange", "Rose", "Violet", "Blue", "Green", "Graphite"]
    }
  };

  var PT = {};
  var lang = "pt";
  var renderers = [];

  function onLangChange(fn) { renderers.push(fn); }
  function d() { return DEMO[lang]; }
  function t(key) { return lang === "en" && EN[key] !== undefined ? EN[key] : PT[key]; }
  function locale() { return lang === "en" ? "en-US" : "pt-BR"; }

  function captureDefaults() {
    PT["meta.title"] = document.title;
    var description = $('meta[name="description"]');
    if (description) PT["meta.description"] = description.getAttribute("content");
    $all("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!(key in PT)) PT[key] = el.innerHTML;
    });
    $all("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var parts = pair.split(":");
        if (!(parts[1] in PT)) PT[parts[1]] = el.getAttribute(parts[0]);
      });
    });
  }

  function applyLang(next) {
    lang = next === "en" ? "en" : "pt";
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
    var titleKey = document.body.getAttribute("data-title-key") || "meta.title";
    if (lang === "en" && EN[titleKey]) document.title = EN[titleKey];
    else if (PT["meta.title"]) document.title = PT["meta.title"];
    var description = $('meta[name="description"]');
    if (description && document.body.getAttribute("data-title-key") === null) description.setAttribute("content", t("meta.description"));
    $all("[data-i18n]").forEach(function (el) {
      var value = t(el.getAttribute("data-i18n"));
      if (value !== undefined && el.innerHTML !== value) el.innerHTML = value;
    });
    $all("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var parts = pair.split(":");
        var value = t(parts[1]);
        if (value !== undefined && value !== null) el.setAttribute(parts[0], value);
      });
    });
    $all("[data-set-lang]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-set-lang") === lang));
    });
    $all("[data-lang-block]").forEach(function (block) {
      block.hidden = block.getAttribute("data-lang-block") !== lang;
    });
    renderers.forEach(function (fn) { fn(); });
  }

  function initLang() {
    captureDefaults();
    var saved = store(LANG_KEY);
    var initial = saved || ((navigator.language || "pt").toLowerCase().indexOf("pt") === 0 ? "pt" : "en");
    $all("[data-set-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        store(LANG_KEY, button.getAttribute("data-set-lang"));
        applyLang(button.getAttribute("data-set-lang"));
      });
    });
    return initial;
  }

  /* -------------------------------------------------------------- accent */

  var ACCENTS = ["#FF892B", "#F43F5E", "#8B5CF6", "#3B82F6", "#10B981", "#171717"];

  function luminance(hex) {
    return [1, 3, 5].map(function (start) {
      var c = parseInt(hex.slice(start, start + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce(function (sum, c, i) { return sum + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }

  function applyAccent(hex) {
    // Graphite (#171717) is the light theme's dark accent; on this dark page it reads as near-white, like the app's dark theme does.
    var brand = hex === "#171717" ? "#e5e5e5" : hex;
    var root = document.documentElement.style;
    root.setProperty("--brand", brand);
    root.setProperty("--brand-foreground", luminance(brand) > 0.45 ? "#161616" : "#ffffff");
    $all(".swatch").forEach(function (swatch) {
      var checked = swatch.getAttribute("data-accent") === hex;
      swatch.setAttribute("aria-checked", String(checked));
      swatch.tabIndex = checked ? 0 : -1;
    });
  }

  function initAccent() {
    var saved = store(ACCENT_KEY);
    var current = ACCENTS.indexOf(saved) >= 0 ? saved : ACCENTS[0];
    var group = demo("swatches");
    if (group) {
      group.innerHTML = ACCENTS.map(function (hex) {
        var shown = hex === "#171717" ? "#e5e5e5" : hex;
        return '<button type="button" class="swatch" role="radio" data-accent="' + hex + '" style="--swatch:' + shown + '"></button>';
      }).join("");
      group.addEventListener("click", function (event) {
        var swatch = event.target.closest(".swatch");
        if (!swatch) return;
        current = swatch.getAttribute("data-accent");
        store(ACCENT_KEY, current);
        applyAccent(current);
      });
      group.addEventListener("keydown", function (event) {
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        current = ACCENTS[(ACCENTS.indexOf(current) + step + ACCENTS.length) % ACCENTS.length];
        store(ACCENT_KEY, current);
        applyAccent(current);
        $('.swatch[data-accent="' + current + '"]').focus();
      });
      onLangChange(function () {
        $all(".swatch", group).forEach(function (swatch, i) { swatch.setAttribute("aria-label", d().accents[i]); });
      });
    }
    applyAccent(current);
  }

  /* ------------------------------------------------------------- release */

  var release = null;

  function parseRelease(data) {
    if (!data || typeof data.tag_name !== "string") return null;
    var version = data.tag_name.replace(/^v/, "");
    var assets = data.assets || [];
    function find(pattern, fallbackName) {
      var asset = assets.filter(function (a) { return pattern.test(a.name); })[0];
      var name = asset ? asset.name : fallbackName;
      return { name: name, url: asset ? asset.browser_download_url : "https://github.com/" + REPO + "/releases/download/" + data.tag_name + "/" + name };
    }
    return {
      version: version,
      tag: data.tag_name,
      page: data.html_url || RELEASES_URL,
      deb: find(/_amd64\.deb$/, "life-board_" + version + "_amd64.deb"),
      appimage: find(/-x86_64\.AppImage$/, "life-board-" + version + "-x86_64.AppImage")
    };
  }

  function renderRelease() {
    $all('[data-release="version"]').forEach(function (el) { el.textContent = release ? "v" + release.version : d().latest; });
    if (!release) return;
    $all('[data-release="deb-file"]').forEach(function (el) { el.textContent = release.deb.name; });
    $all('[data-release="appimage-file"]').forEach(function (el) { el.textContent = release.appimage.name; });
    $all('[data-release="deb-url"]').forEach(function (el) { el.textContent = release.deb.url; });
    $all('[data-release-href="deb"]').forEach(function (el) { el.href = release.deb.url; });
    $all('[data-release-href="appimage"]').forEach(function (el) { el.href = release.appimage.url; });
    $all('[data-release-href="page"]').forEach(function (el) { el.href = release.page; });
    $all("[data-release-only]").forEach(function (el) { el.hidden = false; });
  }

  function initRelease() {
    onLangChange(renderRelease);
    try {
      var cached = JSON.parse(store(RELEASE_KEY) || "null");
      if (cached && Date.now() - cached.at < RELEASE_TTL) {
        release = cached.release;
        renderRelease();
        return;
      }
    } catch (error) { /* ignore a broken cache */ }
    if (!window.fetch) return;
    fetch("https://api.github.com/repos/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
      .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
      .then(function (data) {
        var parsed = parseRelease(data);
        if (!parsed) return;
        release = parsed;
        store(RELEASE_KEY, JSON.stringify({ at: Date.now(), release: parsed }));
        renderRelease();
      })
      .catch(function () { /* keep the links to the releases page and the wildcard commands */ });
  }

  /* --------------------------------------------------------- copy & tabs */

  function initCopy() {
    $all(".copy-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        var source = $("[data-copy-src]", button.parentElement);
        var text = source ? source.textContent.trim() : "";
        var done = function () {
          button.setAttribute("data-copied", "true");
          button.setAttribute("aria-label", t("inst.copied"));
          $("use", button).setAttribute("href", "#i-check");
          setTimeout(function () {
            button.removeAttribute("data-copied");
            button.setAttribute("aria-label", t("inst.copy"));
            $("use", button).setAttribute("href", "#i-copy");
          }, 1600);
        };
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) && done(); });
        } else if (legacyCopy(text)) {
          done();
        }
      });
    });
  }

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (error) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function initTabs() {
    $all('[role="tablist"].install-tabs').forEach(function (list) {
      var tabs = $all('[role="tab"]', list);
      function select(tab, focus) {
        tabs.forEach(function (other) {
          var selected = other === tab;
          other.setAttribute("aria-selected", String(selected));
          other.tabIndex = selected ? 0 : -1;
          document.getElementById(other.getAttribute("aria-controls")).hidden = !selected;
        });
        if (focus) tab.focus();
      }
      tabs.forEach(function (tab, index) {
        tab.addEventListener("click", function () { select(tab, false); });
        tab.addEventListener("keydown", function (event) {
          var step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
          if (!step) return;
          event.preventDefault();
          select(tabs[(index + step + tabs.length) % tabs.length], true);
        });
      });
    });
  }

  /* -------------------------------------------------- hero: the dashboard */

  var habits = [
    { target: 2000, step: 250, count: 1250 },
    { target: 20, step: 5, count: 15 },
    { target: 1, step: 1, count: 0 }
  ];

  function formatTime(date) {
    return date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function ringSvg(habit, radius) {
    var circumference = 2 * Math.PI * radius;
    var segments = Math.min(Math.ceil(habit.target / habit.step), 24);
    var length = circumference / segments;
    var gap = segments > 1 ? 4 : 0;
    var dash = Math.max(length - gap, 1);
    var fraction = Math.min(habit.count / habit.target, 1);
    var out = '<svg class="ring-svg" viewBox="0 0 72 72" aria-hidden="true">';
    for (var i = 0; i < segments; i += 1) {
      out += '<circle class="track" cx="36" cy="36" r="' + radius + '" fill="none" stroke-width="5" stroke-dasharray="' + dash + " " + (circumference - dash) + '" stroke-dashoffset="' + (-i * length) + '"/>';
      var filled = Math.max(0, Math.min(1, fraction * segments - i));
      if (filled > 0) {
        out += '<circle cx="36" cy="36" r="' + radius + '" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="' + dash * filled + " " + (circumference - dash * filled) + '" stroke-dashoffset="' + (-i * length) + '"/>';
      }
    }
    return out + "</svg>";
  }

  function tasksForToday() {
    return taskState.filter(function (task) { return !task.done && (task.due === "today" || task.due === "overdue"); }).length;
  }

  function renderStats() {
    var el = demo("stats");
    if (!el) return;
    var done = habits.filter(function (h) { return h.count >= h.target; }).length;
    var values = [d().tasksCount(tasksForToday()), d().habitsCount(done, habits.length), d().eventsCount, d().mood];
    el.innerHTML = d().stats.map(function (stat, i) {
      return '<div class="card stat-card"><div class="stat-label">' + icon(stat[0]) + "<span>" + stat[1] + '</span></div><div><p class="stat-value">' + values[i] + '</p><p class="stat-hint">' + stat[2] + "</p></div></div>";
    }).join("");
  }

  function renderGreeting() {
    var greeting = demo("greeting");
    if (!greeting) return;
    var hour = new Date().getHours();
    greeting.textContent = d().greeting[hour < 12 ? 0 : hour < 18 ? 1 : 2];
    var today = demo("today");
    var text = new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
    today.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  }

  function renderTimeline() {
    var el = demo("timeline");
    if (!el) return;
    var now = new Date();
    var base = new Date(now);
    base.setSeconds(0, 0);
    base.setMinutes(Math.floor(base.getMinutes() / 5) * 5);
    function at(minutes) { return new Date(base.getTime() + minutes * 60000); }
    var items = [
      { start: at(-120), end: at(-60), color: "var(--event-blue)", state: "past" },
      { start: at(25), end: at(85), color: "var(--event-red)", state: "next" },
      { start: at(240), end: at(300), color: "var(--event-green)", state: "later" }
    ];
    var html = "";
    items.forEach(function (item, i) {
      if (i === 1) html += '<li class="timeline-now">' + d().now + formatTime(now) + "</li>";
      var info = d().events[i];
      var minutes = Math.max(1, Math.round((item.start - now) / 60000));
      html += '<li class="event-row ' + item.state + '" style="--event:' + item.color + '">' +
        '<span class="event-time"><span>' + formatTime(item.start) + "</span><span>" + formatTime(item.end) + "</span></span>" +
        '<span class="event-info"><span class="event-title">' + info[0] + "</span>" +
        (info[1] ? '<span class="event-place">' + icon("map-pin") + info[1] + "</span>" : "") + "</span>" +
        (item.state === "next" ? '<span class="chip-brand">' + d().inMinutes(minutes) + "</span>" : "") +
        "</li>";
    });
    el.innerHTML = html;
  }

  function renderHabits() {
    var el = demo("habits");
    if (!el) return;
    el.innerHTML = habits.map(function (habit, i) {
      var info = d().habits[i];
      var done = habit.count >= habit.target;
      return '<li class="habit-row' + (done ? " done" : "") + '">' +
        '<span class="habit-emoji" aria-hidden="true">' + info[0] + "</span>" +
        '<div class="habit-info"><p class="habit-name">' + info[1] + '</p><p class="habit-count">' + habit.count + " / " + habit.target + " " + info[2] + "</p>" +
        '<p class="habit-hint">' + (done ? d().goalMet : d().addAmount(habit.step, info[2])) + "</p></div>" +
        '<button type="button" class="btn btn-ghost btn-icon xs" data-undo="' + i + '" aria-label="' + escapeHtml(d().undoHabit(info[1])) + '"' + (habit.count === 0 ? " disabled" : "") + ">" + icon("minus", "icon-sm") + "</button>" +
        '<button type="button" class="ring" data-log="' + i + '" aria-label="' + escapeHtml(d().logHabit(info[1])) + " (" + Math.round(Math.min(habit.count / habit.target, 1) * 100) + '%)">' +
        ringSvg(habit, 30) + icon(done ? "check" : "plus") + "</button></li>";
    }).join("");
  }

  function initDashboard() {
    var list = demo("habits");
    if (!list) return;
    list.addEventListener("click", function (event) {
      var log = event.target.closest("[data-log]");
      var undo = event.target.closest("[data-undo]");
      var index = log ? +log.getAttribute("data-log") : undo ? +undo.getAttribute("data-undo") : -1;
      if (index < 0) return;
      var habit = habits[index];
      habit.count = log ? Math.min(habit.count + habit.step, habit.target) : Math.max(habit.count - habit.step, 0);
      renderHabits();
      renderStats();
      var again = $('[data-' + (log ? "log" : "undo") + '="' + index + '"]', list);
      if (again && !again.disabled) again.focus();
    });
    onLangChange(function () { renderGreeting(); renderStats(); renderTimeline(); renderHabits(); });
    setInterval(function () { renderTimeline(); renderGreeting(); }, 30000);
  }

  /* -------------------------------------------------------- quick capture */

  var captureKind = "task";
  var captures = [];

  function renderCaptures() {
    var list = demo("capture-list");
    if (!list) return;
    var seeds = d().captureSeed.map(function (seed) { return { kind: seed[0], text: seed[1], tags: seed[2], seed: true }; });
    var items = captures.concat(seeds).slice(0, 5);
    demo("capture-count").textContent = String(captures.length + seeds.length);
    list.innerHTML = items.map(function (item) {
      return '<li class="list-row' + (item.fresh ? " fresh" : "") + '">' + icon(item.kind === "task" ? "list-todo" : "lightbulb", "row-icon") +
        '<div class="row-main"><p class="row-title">' + escapeHtml(item.text) + '</p><div class="row-meta"><span>' + (item.kind === "task" ? d().task : d().thought) +
        '</span><span class="sep"></span><span>' + (item.seed ? d().today : d().justNow) + "</span>" +
        item.tags.map(function (tag) { return '<span class="tag">#' + escapeHtml(tag) + "</span>"; }).join("") + "</div></div></li>";
    }).join("");
    captures.forEach(function (item) { item.fresh = false; });
  }

  function initCapture() {
    var form = demo("capture-form");
    if (!form) return;
    var input = $("input", form);
    function syncKind() {
      $all("[data-kind]", form).forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-kind") === captureKind));
      });
      input.placeholder = d().capturePlaceholder[captureKind];
    }
    $all("[data-kind]", form).forEach(function (button) {
      button.addEventListener("click", function () {
        captureKind = button.getAttribute("data-kind");
        syncKind();
        input.focus();
      });
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var raw = input.value.trim();
      if (!raw) return;
      var tags = [];
      var text = raw.replace(/#([^\s#]+)/g, function (_, tag) { tags.push(tag.toLowerCase()); return ""; }).replace(/\s+/g, " ").trim();
      captures.unshift({ kind: captureKind, text: text || raw, tags: tags.slice(0, 3), fresh: true });
      captures = captures.slice(0, 5);
      input.value = "";
      renderCaptures();
    });
    onLangChange(function () { syncKind(); renderCaptures(); });
  }

  /* ---------------------------------------------------------------- tasks */

  var taskState = DEMO.pt.tasks.map(function (task, i) { return { index: i, due: task[1], done: false }; });
  taskState.push({ index: -1, due: "today", done: true });
  var taskFilter = "today";

  function taskInfo(task) {
    if (task.index === -1) return lang === "en" ? ["Water the plants", "today", null, ["home"]] : ["Regar as plantas", "today", null, ["casa"]];
    return d().tasks[task.index];
  }

  function matches(task, filter) {
    if (filter === "done") return task.done;
    if (task.done) return false;
    if (filter === "today") return task.due === "today" || task.due === "overdue";
    if (filter === "upcoming") return task.due === "upcoming";
    return true;
  }

  function renderTasks() {
    var filters = demo("task-filters");
    var list = demo("task-list");
    if (!filters || !list) return;
    filters.innerHTML = ["all", "today", "upcoming", "done"].map(function (key) {
      var count = taskState.filter(function (task) { return matches(task, key); }).length;
      return '<button type="button" role="tab" data-filter="' + key + '" aria-selected="' + (key === taskFilter) + '"' + (key === taskFilter ? "" : ' tabindex="-1"') + ">" + d().filters[key] + '<span class="count">' + count + "</span></button>";
    }).join("");
    var visible = taskState.filter(function (task) { return matches(task, taskFilter); });
    list.innerHTML = visible.length ? visible.map(function (task) {
      var info = taskInfo(task);
      var id = "task-" + task.index;
      return '<li class="list-row task-row' + (task.done ? " done" : "") + '">' +
        '<input class="check" type="checkbox" id="' + id + '" data-task="' + task.index + '"' + (task.done ? " checked" : "") + " />" +
        '<div class="row-main"><label class="row-title" for="' + id + '">' + info[0] + '</label><div class="row-meta">' +
        '<span class="' + (info[1] === "overdue" && !task.done ? "tone-danger" : "") + '">' + d().due[info[1]] + "</span>" +
        (info[2] ? '<span class="sep"></span><span class="priority ' + (info[2] === "high" ? "tone-danger" : "tone-warning") + '">' + d().priority[info[2]] + "</span>" : "") +
        info[3].map(function (tag) { return '<span class="tag">#' + tag + "</span>"; }).join("") + "</div></div></li>";
    }).join("") : '<li class="empty-hint">' + icon("circle-check", "icon-xl") + d().emptyFilter + "</li>";
  }

  function initTasks() {
    var filters = demo("task-filters");
    var list = demo("task-list");
    if (!filters || !list) return;
    filters.addEventListener("click", function (event) {
      var button = event.target.closest("[data-filter]");
      if (!button) return;
      taskFilter = button.getAttribute("data-filter");
      renderTasks();
      $('[data-filter="' + taskFilter + '"]', filters).focus();
    });
    filters.addEventListener("keydown", function (event) {
      var step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      var keys = ["all", "today", "upcoming", "done"];
      taskFilter = keys[(keys.indexOf(taskFilter) + step + keys.length) % keys.length];
      renderTasks();
      $('[data-filter="' + taskFilter + '"]', filters).focus();
    });
    list.addEventListener("change", function (event) {
      var box = event.target.closest("[data-task]");
      if (!box) return;
      var task = taskState.filter(function (item) { return item.index === +box.getAttribute("data-task"); })[0];
      task.done = box.checked;
      box.closest(".task-row").classList.toggle("done", task.done);
      renderStats();
      setTimeout(renderTasks, 450);
    });
    onLangChange(renderTasks);
  }

  /* ------------------------------------------------------------- calendar */

  function renderWeek() {
    var el = demo("week");
    if (!el) return;
    var today = new Date();
    var monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    var title = today.toLocaleDateString(locale(), { month: "long", year: "numeric" });
    demo("week-title").innerHTML = icon("calendar-days") + "<span>" + title.charAt(0).toUpperCase() + title.slice(1) + "</span>";
    el.innerHTML = d().week.map(function (events, i) {
      var day = new Date(monday);
      day.setDate(monday.getDate() + i);
      var isToday = day.toDateString() === today.toDateString();
      return '<div class="week-day' + (i >= 5 ? " weekend" : "") + (isToday ? " today" : "") + '"><header>' + d().weekdays[i] + " <b>" + day.getDate() + "</b></header>" +
        events.map(function (event) {
          return '<div class="cal-event ev-' + event[2] + '"><span>' + event[0] + "</span>" + event[1] + "</div>";
        }).join("") + "</div>";
    }).join("");
  }

  /* ---------------------------------------------------------------- goals */

  var milestonesDone = [true, false, false, false];

  function renderGoal() {
    var el = demo("goal");
    if (!el) return;
    var g = d().goal;
    var now = new Date();
    function inDays(n) { var x = new Date(now); x.setDate(now.getDate() + n); return x; }
    function short(date) { return date.toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", ""); }
    var dates = [inDays(-40), inDays(-10), inDays(30), inDays(90)];
    var done = milestonesDone.filter(Boolean).length;
    var percent = Math.round((done / milestonesDone.length) * 100);
    el.innerHTML = '<div class="goal-top"><div><p class="goal-title">' + g.title + '</p><p class="goal-sub">' + g.why + '</p></div>' +
      '<span class="badge">' + g.domain + "</span></div>" +
      '<div class="goal-progress"><div class="goal-progress-head"><span>' + g.progress + " · " + g.until + " " + short(dates[3]) + "</span><b>" + percent + "%</b></div>" +
      '<div class="progress" role="progressbar" aria-label="' + escapeHtml(g.progress) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent + '%"></span></div>' +
      (percent < 50 && !milestonesDone[1] ? '<span class="status-badge tone-warning" style="align-self:flex-start;margin-top:4px">' + g.risk + "</span>" : "") + "</div>" +
      '<ul class="milestones">' + g.milestones.map(function (name, i) {
        return '<li><label><input class="check" type="checkbox" data-milestone="' + i + '"' + (milestonesDone[i] ? " checked" : "") + " /><span>" + name + '</span><span class="date">' + short(dates[i]) + "</span></label></li>";
      }).join("") + "</ul>" +
      '<div class="goal-links"><span class="tag" style="font-size:12px">' + g.habit + '</span><span class="tag" style="font-size:12px">' + g.tasks + "</span></div>";
  }

  function initGoal() {
    var el = demo("goal");
    if (!el) return;
    el.addEventListener("change", function (event) {
      var box = event.target.closest("[data-milestone]");
      if (!box) return;
      var index = +box.getAttribute("data-milestone");
      milestonesDone[index] = box.checked;
      renderGoal();
      $('[data-milestone="' + index + '"]', el).focus();
    });
    onLangChange(renderGoal);
  }

  /* ------------------------------------------------------------- pomodoro */

  var PHASES = { focus: 25, short: 5, long: 15 };
  var timer = { phase: "focus", remaining: 25 * 60, running: false, started: false, endsAt: 0, handle: 0 };

  function renderTimer() {
    var el = demo("timer");
    if (!el) return;
    demo("timer-phases").innerHTML = Object.keys(PHASES).map(function (key) {
      return '<button type="button" data-phase="' + key + '" aria-pressed="' + (key === timer.phase) + '">' + d().phases[key] + "</button>";
    }).join("");
    var minutes = Math.floor(timer.remaining / 60);
    var seconds = timer.remaining % 60;
    demo("timer-time").textContent = (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    var status = timer.running ? d().endsAt(formatTime(new Date(timer.endsAt))) : timer.started ? d().paused : d().ready;
    demo("timer-status").textContent = status + " · " + d().session;
    demo("timer-bar").style.width = (100 - (timer.remaining / (PHASES[timer.phase] * 60)) * 100) + "%";
    var toggle = demo("timer-toggle");
    toggle.innerHTML = icon(timer.running ? "pause" : "play") + "<span>" + (timer.running ? d().pause : timer.started ? d().resume : d().start) + "</span>";
  }

  function stopTimer() {
    clearInterval(timer.handle);
    timer.running = false;
  }

  function setPhase(phase) {
    stopTimer();
    timer.phase = phase;
    timer.remaining = PHASES[phase] * 60;
    timer.started = false;
    renderTimer();
  }

  function initTimer() {
    if (!demo("timer")) return;
    demo("timer-phases").addEventListener("click", function (event) {
      var button = event.target.closest("[data-phase]");
      if (button) setPhase(button.getAttribute("data-phase"));
    });
    demo("timer-toggle").addEventListener("click", function () {
      if (timer.running) {
        stopTimer();
      } else {
        timer.running = true;
        timer.started = true;
        timer.endsAt = Date.now() + timer.remaining * 1000;
        timer.handle = setInterval(function () {
          timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
          if (timer.remaining === 0) { setPhase(timer.phase === "focus" ? "short" : "focus"); return; }
          renderTimer();
        }, 250);
      }
      renderTimer();
    });
    demo("timer-reset").addEventListener("click", function () { setPhase(timer.phase); });
    onLangChange(renderTimer);
  }

  /* --------------------------------------------------------------- github */

  function renderGitHub() {
    var list = demo("gh");
    if (!list) return;
    list.innerHTML = d().gh.map(function (row) {
      return '<li class="list-row">' + icon(row[0], "row-icon " + row[1]) + '<div class="row-main"><p class="row-title">' + row[2] + '</p><div class="row-meta">' + row[3] + "</div></div>" +
        '<span class="status-badge tone-' + row[5] + '">' + row[4] + "</span></li>";
    }).join("");
  }

  function initGitHub() {
    var grid = demo("contrib");
    if (grid) {
      var seed = 7;
      var cells = "";
      for (var i = 0; i < 210; i += 1) {
        seed = (seed * 9301 + 49297) % 233280;
        var r = seed / 233280;
        var level = r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.75 ? 2 : r < 0.9 ? 3 : 4;
        cells += '<i data-l="' + level + '"></i>';
      }
      grid.innerHTML = cells;
    }
    onLangChange(renderGitHub);
  }

  /* ---------------------------------------------------------------- video */

  // Muted, looping and without controls; it plays only while on screen and
  // stays on its poster for people who ask the system for reduced motion.
  function initVideo() {
    $all("video[data-autoplay]").forEach(function (video) {
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      video.muted = true;
      if (reduced) {
        video.removeAttribute("autoplay");
        video.pause();
        return;
      }
      var play = function () { var result = video.play(); if (result && result.catch) result.catch(function () {}); };
      if (!("IntersectionObserver" in window)) { play(); return; }
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { if (entry.isIntersecting) play(); else video.pause(); });
      }, { threshold: 0.25 }).observe(video);
    });
  }

  /* ----------------------------------------------------------------- boot */

  function init() {
    var year = new Date().getFullYear();
    $all("[data-year]").forEach(function (el) { el.textContent = String(year); });
    var initial = initLang();
    initAccent();
    initRelease();
    initCopy();
    initTabs();
    initDashboard();
    initCapture();
    initTasks();
    initGoal();
    initTimer();
    initGitHub();
    initVideo();
    onLangChange(renderWeek);
    applyLang(initial);
  }

  init();
})();
