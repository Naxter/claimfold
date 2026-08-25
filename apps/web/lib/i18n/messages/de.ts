import type { Messages } from './en.ts'

/**
 * German interface text.
 *
 * Duzen throughout, matching how the product speaks elsewhere and how tools
 * for creators generally read in German.
 *
 * The legal line from the English file applies here with more force, not less,
 * because this is the jurisdiction the wording was written for: nothing may
 * say "geprüft", "verifiziert", "korrekt" or "Faktencheck" about a post.
 * Those are Beschaffenheitsangaben under § 434 BGB and § 5a UWG, and a seller
 * can be held to them. The product recherchiert, belegt und blockiert — so
 * that is what it says.
 */
export const de: Messages = {
  common: {
    back: 'Zurück',
    continue: 'Weiter',
    cancel: 'Abbrechen',
    save: 'Speichern',
    saved: 'Gespeichert',
    dismiss: 'Ausblenden',
    restore: 'Wieder anzeigen',
    open: 'Öffnen',
    finish: 'Fertig',
    copy: 'Kopieren',
    copied: 'Kopiert',
    copyManualHint:
      'Dein Browser hat das Kopieren durch die Seite nicht erlaubt. Der Text ist markiert — drücke Strg+C (⌘C am Mac). Browser erlauben das Kopieren nur über https oder auf localhost.',
    optional: 'optional',
    none: 'Keine',
    yes: 'Ja',
    no: 'Nein',
    loading: 'Läuft…',
  },

  nav: {
    board: 'Übersicht',
    topics: 'Themen',
    generate: 'Erstellen',
    niches: 'Kanäle',
    members: 'Personen',
    settings: 'Einstellungen',
    backToBoard: '← Zurück zur Übersicht',
    landmark: 'Hauptnavigation',
  },

  signIn: {
    title: 'Anmelden',
    subtitle: 'Melde dich in deinem Arbeitsbereich an.',
    email: 'E-Mail',
    password: 'Passwort',
    submit: 'Anmelden',
    noAccount: 'Noch kein Konto?',
    createOne: 'Jetzt anlegen',
    signingIn: 'Anmeldung läuft…',
    name: 'Dein Name',
    signUpSubtitle: 'Richte deinen Arbeitsbereich ein.',
    invitedSignUpSubtitle: 'Lege dein Konto an, um dem eingeladenen Arbeitsbereich beizutreten.',
    passwordHint: 'Mindestens 12 Zeichen.',
    createAccount: 'Konto anlegen',
    haveAccount: 'Schon ein Konto? Anmelden',
    workspaceNameTemplate: 'Arbeitsbereich von {owner}',
  },

  board: {
    title: 'Übersicht',
    createPost: 'Beitrag erstellen',
    columns: {
      review: 'Wartet auf dich',
      approved: 'Freigegeben',
      scheduled: 'Geplant',
      published: 'Veröffentlicht',
      closed: 'Gestoppt',
    },
    unresolved: (count: number) => (count === 1 ? '1 offen' : `${count} offen`),
    slideCount: (count: number) => (count === 1 ? '1 Slide' : `${count} Slides`),
    capped: (count: number) =>
      `Gezeigt werden die ${count} zuletzt geänderten. Die Zahlen zählen alles.`,
    empty: {
      title: 'Noch keine Beiträge.',
      body: 'Erstelle einen und sieh zu: Eine Idee wird entworfen, jede Tatsachenaussage darin wird in echten Quellen nachgeschlagen, und erst danach wird überhaupt etwas geschrieben.',
      createFirst: 'Ersten Beitrag erstellen',
      setUpPublishing: 'Veröffentlichen einrichten',
      notConnected:
        'Es ist noch kein Instagram-Konto verbunden. Du kannst Beiträge erstellen und prüfen, aber nicht veröffentlichen. Das Verbinden dauert etwa zehn Minuten.',
    },
  },

  generate: {
    title: 'Beitrag erstellen',
    intro:
      'Vier Ideen werden entworfen, die beste wird ausgewählt, und jede Tatsachenaussage darin wird in echten Quellen nachgeschlagen. Diese Prüfung passiert, bevor irgendetwas geschrieben wird — eine Idee, die nicht standhält, kostet dich also nie einen fertigen Beitrag.',
    niche: 'Kanal',
    nicheHelp:
      'Der Kanal legt Sprache, Tonfall und Slide-Layouts fest — und wie sicher eine Aussage belegt sein muss, bevor sie verwendet werden darf.',
    topic: 'Thema',
    topicPlaceholder: 'Leer lassen, dann wird ein Thema für dich gewählt',
    topicFromDiscovery:
      'Aus einem gefundenen Thema übernommen. Ändere es ruhig — das ist ein Ausgangspunkt, keine Überschrift.',
    slides: 'Anzahl der Slides',
    slidesPlaceholder: 'Das Layout entscheiden lassen',
    slidesHelp: (max: number) =>
      `Instagram erlaubt bis zu ${max} Slides. Jedes Layout funktioniert in seinem eigenen Bereich am besten.`,
    submit: 'Erstellen',
    working: 'Wird erstellt…',
    cost:
      'Das dauert etwa eine Minute und kostet rund 0,40 $. Lass diesen Tab offen.',
    stages: [
      'Ideen sammeln',
      'Jede Aussage in echten Quellen nachschlagen',
      'Entscheiden, ob sie standhält',
      'Slides schreiben',
    ],
    gateNote:
      'Halten die Aussagen nicht stand, wird nichts geschrieben. Du landest bei einem gestoppten Beitrag, der dir genau zeigt, welche Aussage gescheitert ist und wonach gesucht wurde.',
    noNiche: {
      title: 'Noch kein Kanal eingerichtet.',
      body: 'Ein Kanal enthält Sprache, Tonfall, Slide-Layouts und deine Regeln.',
      seedHint: (command: string) => `Führe ${command} aus, um den Beispielkanal anzulegen.`,
    },
    problems: 'Diese Kanäle lassen sich noch nicht verwenden:',
    misconfigured: 'muss korrigiert werden',
    formats: (count: number) => (count === 1 ? '1 Layout' : `${count} Layouts`),
    recentRuns: 'Zuletzt',
    spend: (runs: number, usd: string) =>
      `${runs} Beitrag${runs === 1 ? '' : 'e'} in den letzten 30 Tagen erstellt, für rund ${usd} $ an Modellaufrufen.`,
    alreadyRunning: 'Gerade wird ein Beitrag erstellt.',
    alreadyRunningSince: (at: Date, locale: string) =>
      `Gestartet um ${at.toLocaleTimeString(locale)}. Der Vorgang läuft weiter, auch wenn du diese Seite verlässt — sobald er fertig ist, erscheint der neue Beitrag unten unter „Zuletzt“ und in der Übersicht.`,
    language: (language: string) => `Wird auf ${language} geschrieben`,
  },

  topics: {
    title: 'Themen',
    intro: (durabilityPercent: number) =>
      `Themen, über die sich zu schreiben lohnt, gefunden in frei zugänglichen Quellen: Wikipedias eigenen Abrufzahlen, veröffentlichten Trendlisten und offenen Nachrichtenindizes. Sortiert danach, ob sie auch nächstes Jahr noch lesenswert sind — das sind ${durabilityPercent} % der Bewertung. Aktuell in den Nachrichten zu sein hebt ein gutes Thema an, rettet aber nie ein schwaches.`,
    niche: 'Kanal',
    discover: 'Themen suchen',
    colTopic: 'Thema',
    colViews: 'Aufrufe / Monat',
    colLinks: 'Quellen',
    colScore: 'Bewertung',
    colWhy: 'Begründung',
    colActions: 'Aktionen',
    working: 'Suche läuft…',
    waitTitle: 'Das dauert ein paar Minuten und kostet nichts. Lass diesen Tab offen.',
    waitBody:
      'Alle Quellen hier sind kostenlos, und wir fragen bewusst höchstens zehn Seiten pro Minute ab — deutlich weniger, als erlaubt wäre. Die Wartezeit ist Rücksicht, keine Warteschlange. Wikipedias Abrufdaten betreibt ein gemeinnütziger Verein, und Werkzeuge, die darauf einprügeln, sind der Grund, warum offene Dienste irgendwann schließen.',
    waitCached:
      'Ergebnisse werden gespeichert, der nächste Durchlauf ist also deutlich schneller. Hier wird nichts geschrieben und nichts veröffentlicht — dieser Schritt entscheidet nur, was einen Blick wert ist.',
    aboutLastRun: 'Zur letzten Suche',
    accepted: 'Lohnt sich',
    acceptedEmpty: 'Diesmal ist nichts durchgekommen.',
    recommended: 'Empfohlen für diesen Kanal',
    recommendedEmpty: 'Diesmal passt nichts eng zu diesem Kanal.',
    explore: 'Über den Kanal hinaus entdecken',
    exploreEmpty: 'Diesmal keine weiteren Ideen.',
    exploreNote:
      'Diese Themen haben die Sicherheitsregeln bestanden, teilen aber noch nicht den Wortschatz deines Kanals. Sie sind Ideen zum Erkunden, keine Empfehlungen.',
    rejected: 'Zurückgestellt',
    rejectedEmpty: 'Nichts zurückgestellt.',
    rejectedNote:
      'Mit Begründung aufbewahrt. Ein Thema, das an einem Grenzfall gescheitert ist, ist genau das, wo du anderer Meinung sein könntest — deshalb siehst du es und entscheidest selbst.',
    dismissed: 'Ausgeblendet',
    dismissedEmpty: 'Nichts ausgeblendet.',
    showDismissed: 'Ausgeblendete Themen anzeigen',
    empty:
      'Für diesen Kanal wurde noch nichts gefunden. Die erste Suche dauert ein paar Minuten, weil wir deutlich unter dem bleiben, was die kostenlosen Quellen erlauben.',
    noNiche: {
      title: 'Noch kein Kanal eingerichtet.',
      body: 'Themen werden gegen Sprache und Themenfelder eines Kanals bewertet — den brauchst du also zuerst.',
    },
    viewsPerMonth: (views: string) => `${views} Aufrufe im Monat`,
    links: (count: number) => (count === 1 ? '1 Quellenlink' : `${count} Quellenlinks`),
    linksHelp: (floor: number) =>
      `Links aus dem Wikipedia-Artikel heraus. Alles mit weniger als ${floor} lassen wir aus, weil dünne Artikel selten genug hergeben, um daraus zu arbeiten.`,
    trending: 'in den Nachrichten',
    alreadyUsed: 'Schon verwendet',
    generate: 'Beitrag erstellen',
    article: 'Artikel lesen',
    scoreHelp:
      'Gesamtbewertung. Die Skala geht bis 1,30, sobald die heutige Aufmerksamkeit mitzählt.',
    breakdown: (parts) =>
      `Bleibt interessant ${parts.lasting} · wird gesucht ${parts.interest} · Quellenlage ${parts.sources} · passt zum Kanal ${parts.fit}`,
    recencyBoost: (multiplier: string) => `×${multiplier} für Aktualität`,
    reasons: {
      'too-few-references': 'zu wenige Quellen',
      'disputed-or-outdated': 'von Wikipedia-Autoren markiert',
      'living-person': 'lebende Person',
      ymyl: 'Gesundheit, Geld oder Recht',
      'too-new': 'Artikel ist sehr neu',
      'single-recent-spike': 'einmaliges Nachrichtenereignis',
      'no-article': 'kein Artikel gefunden',
    },
  },

  niches: {
    title: 'Kanäle',
    intro:
      'Ein Kanal ist dein gesamtes Setup: Sprache, für wen du schreibst, wie es klingen soll, welche Slide-Layouts du nutzt und welche Regeln gelten. Alles änderbar, ohne Code anzufassen.',
    language: 'Sprache',
    audience: 'Geschrieben für',
    voice: 'Tonfall',
    formats: 'Slide-Layouts',
    seeds: 'Themenfelder',
    rules: 'Regeln',
    minConfidence: 'Wie sicher eine Aussage sein muss',
    requireSources: 'Jeder Beitrag muss seine Quellen zeigen',
    publicInterest: 'Beiträge als KI-gestützt kennzeichnen',
    forbidden: 'Nie darüber schreiben',
    cadence: 'Wie oft veröffentlicht wird',
    postsPerWeek: (count: number) =>
      count === 1 ? '1 Beitrag pro Woche' : `${count} Beiträge pro Woche`,
    default: 'Standard',
    theme: 'Aussehen',
    invalid: (detail: string) =>
      `Die Einrichtung dieses Kanals ist nicht gültig, er lässt sich daher noch nicht verwenden: ${detail}`,
    neverCovers: 'Nie darüber:',
    empty: {
      title: 'Noch keine Kanäle.',
      body: (command: string) => `Führe ${command} aus, um den Beispielkanal anzulegen.`,
    },
    footer:
      'Kanäle gehen von den Beispielen im Code aus und liegen nach der Einrichtung in der Datenbank.',
    footerLink: 'Damit einen Beitrag erstellen',
  },

  settings: {
    title: 'Einstellungen',

    account: {
      heading: 'Dein Konto',
      name: 'Dein Name',
      nameHint: 'Steht im redaktionellen Nachweis bei den Beiträgen, die du freigibst.',
      email: 'E-Mail',
      emailHint: 'Damit meldest du dich an.',
      saveProfile: 'Speichern',
      saving: 'Wird gespeichert…',
      profileSaved: 'Gespeichert.',

      passwordHeading: 'Passwort ändern',
      currentPassword: 'Aktuelles Passwort',
      currentPasswordHint:
        'Wird abgefragt, weil eine offen gelassene Sitzung auf einem fremden Rechner nicht ausreichen soll, um dich aus deinem eigenen Konto auszusperren.',
      newPassword: 'Neues Passwort',
      newPasswordHint: 'Mindestens 12 Zeichen.',
      confirmPassword: 'Neues Passwort wiederholen',
      changePassword: 'Passwort ändern',
      passwordChanged: 'Passwort geändert. Deine anderen Sitzungen wurden abgemeldet.',
      signOutOthers: 'Überall sonst abmelden',
      signOutOthersHint: 'Beendet alle Sitzungen außer dieser.',

      errors: {
        nameEmpty:
          'Gib einen Namen an — er steht im redaktionellen Nachweis bei den Beiträgen, die du freigibst.',
        emailInvalid: 'Das sieht nicht wie eine E-Mail-Adresse aus.',
        emailTaken: 'Ein anderes Konto hier nutzt diese Adresse schon.',
        wrongPassword: 'Das ist nicht dein aktuelles Passwort.',
        tooShort: (min: number) => `Ein Passwort braucht mindestens ${min} Zeichen.`,
        mismatch: 'Die beiden neuen Passwörter sind nicht gleich.',
        sameAsOld: 'Das ist das Passwort, das du schon hast.',
        failed: 'Das ließ sich nicht speichern. Versuch es nochmal.',
      },
    },

    language: {
      heading: 'Sprache',
      interface: 'Sprache des Dashboards',
      interfaceHelp:
        'Was du hier siehst: Schaltflächen, Beschriftungen und Hilfetexte. Ändert nichts an bereits erstellten Beiträgen.',
      output: 'Sprache für neue Kanäle',
      outputHelp:
        'Neue Kanäle starten in dieser Sprache. Bestehende Kanäle behalten ihre eigene — so kann ein Konto gleichzeitig einen deutschen und einen englischen Kanal betreiben.',
      followInterface: 'Wie das Dashboard',
      saved: 'Sprache gespeichert.',
    },
    readiness: {
      usedByChannels: (names: string) =>
        `Veröffentlicht für: ${names}. Wird dieses Konto getrennt oder werden seine Daten gelöscht, lassen sich diese Kanäle nicht mehr veröffentlichen, bis ihnen ein anderes Konto zugewiesen wird.`,
      heading: 'Bevor du veröffentlichen kannst',
      guidedSetup: 'Schritt für Schritt →',
      appUrl: 'Öffentliche Adresse für Meta-Rückleitungen',
      images: 'Instagram erreicht deine Slide-Bilder',
      imagesNotSet: 'Noch nicht eingerichtet',
      account: 'Instagram-Konto verbunden',
      accountNone: 'Noch nicht verbunden',
      token: 'Verbindung ist aktiv',
      tokenNone: 'Noch nicht verbunden',
      tokenDays: (days: number) =>
        `Erneuert sich automatisch. Noch ${days} Tage auf der aktuellen Verbindung.`,
      imagesWarning:
        'Instagram lädt deine Slide-Bilder von seinen eigenen Servern aus. Sie müssen deshalb unter einer öffentlichen Webadresse liegen. Eine lokale Adresse funktioniert hier im Dashboard und scheitert genau dann, wenn du veröffentlichst.',
    },
    connect: {
      headingNew: 'Instagram verbinden',
      headingExisting: 'Instagram neu verbinden',
      intro:
        'Claimfold nutzt deine eigene Meta-App, nicht unsere. Genau das erspart dir Metas Prüfverfahren — kein Antrag, keine Unternehmensverifizierung, kein Warten. Lege unter {link} eine App an, füge Instagram hinzu und trage dein eigenes Instagram-Konto als Nutzer ein.',
      stepByStep: 'Lieber Schritt für Schritt',
      redirectLabel: 'Rückkehradresse für deine Meta-App',
      appId: 'Instagram-App-ID',
      appSecret: 'Instagram-App-Secret',
      secretNote: 'Wird vor dem Speichern verschlüsselt und nie wieder angezeigt.',
      submitNew: 'Instagram verbinden',
      submitExisting: 'Neu verbinden',
    },
  },

  setup: {
    stepDone: 'abgeschlossen',
    title: 'Veröffentlichen einrichten',
    stepOf: (step: number, total: number) => `Schritt ${step} von ${total}`,
    notChecked: 'Das können wir von hier aus nicht prüfen.',
    doneContinue: 'Erledigt — weiter',
    skipForNow: 'Vorerst überspringen',
    steps: {
      account: { short: 'Konto', title: 'Ein professionelles Konto' },
      metaApp: { short: 'Meta-App', title: 'Deine eigene Meta-App' },
      redirect: { short: 'Rückkehradresse', title: 'Rückkehradresse eintragen' },
      connect: { short: 'Verbinden', title: 'Konto verbinden' },
      ready: { short: 'Bereit', title: 'Bereit zum Veröffentlichen' },
    },
    account: {
      body: 'Instagram lässt Apps nur auf ein professionelles Konto veröffentlichen — Business oder Creator. Ein privates Konto wird abgelehnt, und das merkst du erst beim Veröffentlichen. Deshalb lohnt es sich, damit anzufangen.',
      how: 'Das stellst du in der Instagram-App selbst um, in deinen Kontoeinstellungen. Es ist kostenlos und jederzeit umkehrbar.',
      unverifiable:
        'Wir sehen deinen Kontotyp erst, wenn du verbunden bist. Fehlt dieser Schritt, zeigt sich das in Schritt 4 als fehlgeschlagene Verbindung — nicht jetzt als Warnung.',
    },
    metaApp: {
      body: 'Claimfold spricht als deine App mit Instagram, nicht als unsere. Lege unter {link} eine an, füge Instagram hinzu und wähle die Instagram-Anmeldung statt der Facebook-Anmeldung — so brauchst du keine Facebook-Seite.',
      roleHolder:
        'Trage danach dein eigenes Instagram-Konto als Nutzer der App ein. Dieser Schritt spart dir Wochen: Eine App, die nur Konten anfasst, die ihr zugeordnet sind, braucht keine Prüfung durch Meta. Würden alle dieselbe App teilen, verlangte Meta vor deinem ersten Beitrag eine vollständige Prüfung.',
      reference: 'Metas Dokumentation:',
      unverifiable: 'Was in deiner Meta-App steht, kann diese Installation nicht sehen.',
    },
    redirect: {
      alsoRequired:
        'Meta verlangt außerdem diese beiden, bevor die App gespeichert werden kann. Beides sind echte Endpunkte dieser Installation: Über den ersten meldet Instagram, wenn jemand sein Konto trennt, über den zweiten fordert eine Person die Löschung ihrer Daten an.',
      deauthorizeLabel: 'Deauthorize-Callback-URL',
      dataDeletionLabel: 'URL für Datenlöschungsanfragen',
      body: 'Trage diese Webadresse in deiner Meta-App als Redirect-URI ein — die Adresse, an die Instagram dich zurückschickt, nachdem du die Verbindung bestätigt hast. Meta vergleicht Zeichen für Zeichen: Ein fehlender Schrägstrich oder http statt https reicht, damit es scheitert, und die Fehlermeldung sagt dir das nicht. Kopiere sie, statt sie abzutippen.',
      localWarning:
        'Das zeigt auf deinen eigenen Rechner. Zum Einrichten ist das in Ordnung. Zum Veröffentlichen brauchst du eine öffentliche Webadresse — sobald du eine hast, setze APP_URL und trage die neue Adresse zusätzlich in der Meta-App ein. Meta vergleicht exakt, es ist also ein zweiter Eintrag, kein Ersatz.',
      unverifiable:
        'Ob Meta das gespeichert hat, lässt sich nur durch Ausprobieren feststellen — das ist der nächste Schritt.',
    },
    connect: {
      connected: (username: string) =>
        `Verbunden als @${username}. Erneutes Verbinden ersetzt das — praktisch, wenn die Verbindung nicht mehr funktioniert oder du das Konto wechselst.`,
      body: 'Füge die beiden Werte ein und bestätige die Verbindung. Du wirst zu Instagram geschickt, dort um drei Berechtigungen gebeten und direkt wieder zurückgebracht.',
      warningTitle: 'Nicht die App-ID oben auf der Seite',
      warningBody:
        'Die Instagram-Anmeldung nutzt die Instagram-App-ID und das Instagram-App-Secret aus dem Instagram-Bereich innerhalb deiner Meta-App — nicht die Meta-App-ID in der Kopfzeile. Beides sind lange Zahlen, und der falsche Wert scheitert mit einer Meldung, die keinen von beiden nennt. Wenn die Verbindung scheitert und der Fehler vage bleibt: hier zuerst nachsehen.',
      warningRelabel:
        'Meta benennt in diesem Dashboard häufig Dinge um. Halte dich deshalb an die Einrichtungsseite des Instagram-Bereichs — dieselbe, die nach der Rückkehradresse fragt — statt an einen bestimmten Menünamen.',
    },
    ready: {
      allGood:
        'Alles Nötige ist da. Von allein wird nichts veröffentlicht — ein Beitrag muss weiterhin standhalten und von dir freigegeben werden.',
      canary:
        'Bevor du einen echten Beitrag planst, veröffentliche ein freigegebenes Test-Karussell in einem Testkonto und prüfe es auf Instagram. Die Live-Canary-Checkliste in der Dokumentation hält fest, was du kontrollieren solltest.',
      blocked:
        'Veröffentlichen ist gesperrt, bis oben jede Zeile grün ist. Planst du vorher einen Beitrag, scheitert er genau zu dem Zeitpunkt, an dem er erscheinen sollte — und da schaut niemand hin.',
    },
  },

  review: {
    scheduledFor: (when: string) => `Geplant für ${when}.`,
    scheduledSoon: 'Geht raus, sobald der Worker den Beitrag aufnimmt.',
    rescheduleTo: 'Verschieben auf',
    reschedule: 'Verschieben',
    rescheduling: 'Wird verschoben…',
    unschedule: 'Aus der Planung nehmen',
    unscheduling: 'Wird herausgenommen…',
    unscheduleHint:
      'Herausnehmen setzt den Beitrag zurück auf „Wartet auf Freigabe“. Es wird nichts gelöscht.',
    title: 'Freigabe',
    record: 'Quellen & Entscheidungen',
    reject: 'Beitrag stoppen',
    approve: 'Freigeben',
    approveNow: 'Freigeben & jetzt veröffentlichen',
    approveScheduled: 'Freigeben & einplanen',
    approveBlocked: 'Kläre zuerst die Punkte unten',
    rejectReason: 'Warum (optional)',
    rejectReasonPlaceholder: 'Wird im redaktionellen Nachweis festgehalten',
    viewOnInstagram: 'Auf Instagram ansehen',
    performance: 'Wie es lief',
    metricSaved: 'Speicherungen',
    metricShares: 'Weitergeleitet',
    metricReach: 'Reichweite',
    metricComments: 'Kommentare',
    metricLikes: 'Likes',
    metricFollows: 'Neue Follower',
    metricAsOf: 'Gemessen',
    reviewNote: 'Notiz',
    loadingTitle: 'Beitrag wird geladen…',
    publishProblem: 'Problem beim Veröffentlichen',
    attemptCount: (n: number) => `${n} Versuche`,
    slides: 'Slides',
    noSlides:
      'Es wurde nichts geschrieben. Die Prüfung hat diesen Beitrag vor dem Schreiben gestoppt, es gibt also keine Slides — die Gründe stehen oben, und jede geöffnete Quelle steht im Nachweis.',
    noSlidesAction: 'Nachweis öffnen',
    noClaims: 'Es wurden keine Aussagen erfasst — es gibt hier also nichts, worauf sich eine Freigabe stützen könnte.',
    caption: 'Bildunterschrift',
    captionCount: (used: number, max: number) => `${used} von ${max} Zeichen`,
    noAltText: 'kein Alt-Text',
    evidence: (count: number) =>
      count === 1 ? 'Worauf es beruht · 1 Aussage' : `Worauf es beruht · ${count} Aussagen`,
    core: 'Kernaussage',
    ready: 'Bereit zum Veröffentlichen',
    blocked: (count: number) =>
      count === 1 ? 'Gesperrt — 1 offener Punkt' : `Gesperrt — ${count} offene Punkte`,
    allGood: 'Jede Kernaussage hat Quellen und liegt über der von dir gesetzten Sicherheit.',
    overridden: 'Eine Person hat das trotzdem akzeptiert',
    overridePlaceholder: 'Warum ist das trotzdem in Ordnung?',
    override: 'Trotzdem akzeptieren',
    publishAt: 'Veröffentlichen am',
    publishAtHint: 'Leer lassen, dann geht es so bald wie möglich raus.',
    approving: 'Wird freigegeben…',
    rejecting: 'Wird gestoppt…',
    overriding: 'Wird gespeichert…',
    publishesTo: 'Veröffentlicht auf',
    publishesToNone: 'Kein Konto — das lässt sich nicht veröffentlichen',
    changeAccount: 'Ändern',
    accountFromChannel: 'Vom Kanal übernommen. Eine Änderung hier gilt nur für diesen Beitrag.',
    unusableLink: 'Link lässt sich nicht öffnen',

    edit: {
      open: 'Bearbeiten',
      cancel: 'Abbrechen',
      save: 'Speichern',
      saving: 'Wird gespeichert…',
      tabText: 'Text',
      tabLook: 'Aussehen',
      altText: 'Alt-Text',
      altTextHint:
        'Beschreibt das Slide für Menschen mit Screenreader, und Instagram nimmt es in die Suche auf. Ohne ihn lässt sich der Beitrag nicht freigeben.',
      headline: 'Überschrift',
      body: 'Text',
      kicker: 'Dachzeile',
      footnote: 'Fußnote',
      figure: 'Zahl',
      figureBadge: 'Positionsnummer',
      figureDate: 'Datum',
      figureLabel: 'Was die Zahl misst',
      items: 'Zeilen',
      panelTop: 'Oberes Feld',
      panelBottom: 'Unteres Feld',
      addLine: 'Zeile hinzufügen',
      removeLine: 'Diese Zeile entfernen',
      layout: 'Layout',
      layoutInherit: 'Wie der restliche Beitrag',
      layoutFixed:
        'Anfangs-, Quellen- und Abschluss-Slide sehen in jedem Layout gleich aus, damit ein Karussell als ein Ganzes wirkt.',
      layouts: {
        editorial: 'Redaktionell',
        split: 'Zwei Felder',
        list: 'Nummeriert',
        timeline: 'Zeitleiste',
        figure: 'Große Zahl',
        photo: 'Foto',
      },
      picture: 'Bild',
      pictureNone: 'Kein Bild',
      pictureOption: 'Bild {n}',
      pictureUpload: 'Bild hochladen',
      pictureUploading: 'Wird hochgeladen…',
      pictureRecent: 'Schon hochgeladen',
      pictureRemove: 'Bild entfernen',
      pictureHint:
        'Text liegt nie direkt auf dem Foto, sondern auf einer Fläche in der Themenfarbe — so bleibt er lesbar, egal was das Bild an der Stelle macht.',
      moveUp: 'Nach vorne',
      moveDown: 'Nach hinten',
      remove: 'Dieses Slide löschen',
      add: 'Slide hinzufügen',
      addHere: 'Hier ein Slide einfügen',
      addRole: 'Art des Slides',
      appearance: 'Wie alle Slides aussehen',
      theme: 'Thema',
      accent: 'Akzentfarbe',
      accentHint: 'Leer lässt die Farbe des Themas.',
      watermark: 'Wasserzeichen',
      watermarkHint: 'Klein auf jedem Slide. Normalerweise dein Handle.',
      apply: 'Übernehmen',
      applying: 'Wird übernommen…',
      editedByHand: 'von Hand geändert',
      caption: 'Bildunterschrift',
      hashtags: 'Hashtags',
      hashtagsHint:
        'Getrennt durch Leerzeichen oder Kommas. Drei bis fünf passende sind besser als dreißig.',
      firstComment: 'Erster Kommentar',
      firstCommentHint: 'Wird direkt nach dem Veröffentlichen als eigener Kommentar gepostet. Guter Platz für die Quellen, damit sie nicht die erste Zeile der Bildunterschrift auffressen.',
      hook: 'Aufhänger',
      hookHint: 'Getrennt gespeichert, damit du siehst, welche Anfänge Speicherungen bringen.',
    },

    editErrors: {
      alreadyPublishing:
        'Dieser Beitrag wird gerade veröffentlicht und kann jetzt nicht geändert werden. Warte, bis es fertig ist.',
      badSchedule: 'Das ist kein gültiges Datum mit Uhrzeit.',
      overrideTooShort:
        'Nenne eine Begründung mit mindestens 10 Zeichen. Sie wird im Nachweis unter deinem Namen festgehalten und sollte deshalb etwas aussagen.',
      stale:
        'Jemand hat dieses Slide geändert, während es bei dir offen war. Es wurde nichts gespeichert — neu laden und nochmal versuchen.',
      missing: 'Dieses Slide gehört nicht mehr zu diesem Beitrag.',
      notEditable:
        'Ein eingeplanter oder schon veröffentlichter Beitrag lässt sich nicht bearbeiten. Stoppe ihn erst, wenn du etwas ändern willst.',
      notPermitted:
        'Deine Rolle in diesem Arbeitsbereich erlaubt das nicht. Ein Inhaber oder Admin kann sie in der Mitgliederliste ändern.',
      shapeChanged:
        'Das Karussell hat sich geändert, während du es angesehen hast. Es wurde nichts gespeichert — neu laden und nochmal versuchen.',
      tooFew: 'Ein Karussell braucht mindestens zwei Slides, dieses kann also nicht weg.',
      tooMany: (max: number) => `Instagram erlaubt höchstens ${max} Slides.`,
      badField:
        'Das Formular enthielt ein Feld, das dieses Layout nicht nutzt — es wurde nichts gespeichert.',
      accentNotAColour: 'Gib die Farbe als Hex-Wert an, zum Beispiel #B4472B.',
      accentUnreadable: (ratio: string, floor: string) =>
        `Diese Farbe erreicht gegen das Thema nur ${ratio}:1, Text braucht aber ${floor}:1, um auf Armlänge lesbar zu bleiben.`,
      uploadTooLarge: (mb: number) => `Dieses Bild ist über ${mb} MB groß.`,
      uploadNotAnImage: 'Diese Datei ließ sich nicht als Bild lesen.',
      uploadMissing: 'Es war kein Bild dabei.',
      noRole: 'Wähle, welche Art Slide dazukommen soll.',
    },
    verdicts: {
      supported: 'Quellen stimmen zu',
      disputed: 'Quellen widersprechen sich',
      false: 'Quellen sprechen dagegen',
      unverifiable: 'keine gute Quelle gefunden',
    },
  },

  channels: {
    create: 'Neuer Kanal',
    createTitle: 'Neuer Kanal',
    editTitle: 'Kanal bearbeiten',
    edit: 'Bearbeiten',
    duplicate: 'Duplizieren',
    archive: 'Stilllegen',
    restore: 'Wieder aktivieren',
    archivedHeading: 'Stillgelegt',
    archivedNote:
      'Stillgelegte Kanäle sind aus der Übersicht ausgeblendet und können keine neuen Beiträge erzeugen. Gelöscht wird nichts — die Beiträge daraus behalten ihren Nachweis.',
    saved: 'Kanal gespeichert.',
    generatedBanner:
      'Aus deiner Beschreibung entworfen. Lies es einmal durch, bevor du damit arbeitest: Wie sicher eine Aussage sein muss und worüber der Kanal nie schreibt, steht beides hier.',
    copyOf: (name: string) => `${name} (Kopie)`,

    generator: {
      heading: 'Beschreibe einen Kanal in einem Satz',
      hint: 'Worum geht es, für wen, und wie soll es ungefähr klingen? Zwei Sätze reichen.',
      placeholder:
        'Deutschsprachige Beiträge über verbreitete Irrtümer in der Geschichte, für neugierige Erwachsene, die sich gern überraschen lassen.',
      language: 'Geschrieben auf',
      submit: 'Kanal entwerfen',
      working: 'Wird entworfen…',
      cost:
        'Ein kurzer Modellaufruf, ein paar Cent. Du landest im Editor, und nichts wird verwendet, bevor du speicherst.',
    },

    form: {
      identityHeading: 'Identität',
      name: 'Name',
      slug: 'Kurzname',
      slugHint: 'Kleinbuchstaben, Ziffern und Bindestriche. Kommt in Links vor, nie beim Leser an.',
      description: 'Beschreibung',
      descriptionHint: 'Eine Notiz für dich. Geht nicht ans Modell.',
      language: 'Sprache der Beiträge',
      languageHint:
        'Ein BCP-47-Kürzel: de, en, pt-BR. Legt fest, in welcher Sprache geschrieben wird — und damit auch Silbentrennung, Datums- und Zahlenformate.',

      voiceHeading: 'Tonfall',
      audience: 'Geschrieben für',
      audienceHint:
        'Geht wortwörtlich in jeden Prompt, schreib es also als Anweisung und nicht als Werbetext. „Anfänger, die das Werkzeug schon haben und immer über dieselben drei Dinge stolpern“ ist brauchbar; „alle, die sich für Handwerk interessieren“ nicht.',
      voice: 'Wie es klingen soll',
      voiceHint: 'Geht ebenfalls wortwörtlich ein, beim Schreiben der Slides.',

      whatHeading: 'Was entsteht',
      topicSeeds: 'Themenfelder',
      topicSeedsHint:
        'Eines pro Zeile. Felder, die jeweils mehrere Beiträge tragen können — keine Titel einzelner Beiträge.',
      formats: 'Slide-Layouts',
      formatsHint:
        'Mindestens eines. Ein Layout beschreibt die Form einer Argumentation — eine Aussage und ihr Beleg, eine geordnete Liste, ein Vorher und Nachher — deshalb passt jedes Thema in jedes davon.',
      hashtagSets: 'Hashtag-Sets',
      hashtagSetsHint:
        'Ein Set pro Zeile, mit Leerzeichen getrennt. Seit es kein Hashtag-Folgen mehr gibt, sind sie Suchmetadaten — drei bis fünf passende sind besser als dreißig.',

      account: 'Veröffentlicht auf',
      accountHint: 'Auf welches verbundene Instagram-Konto dieser Kanal postet. Hier statt pro Beitrag gewählt, damit Wasserzeichen und Konto nie unterschiedliche Handles nennen.',
      accountNone: 'Kein Konto gewählt',
      accountNoneAvailable: 'Es ist noch kein Instagram-Konto verbunden. Verbinde eines in den Einstellungen und wähle es dann hier aus.',
      lookHeading: 'Aussehen',
      theme: 'Thema',
      accent: 'Akzentfarbe',
      // Nicht „geprüft“: das Wort ist im ganzen Produkt gesperrt, weil es bei
      // Inhalten eine Beschaffenheitsangabe wäre. Hier geht es um den Kontrast
      // einer Farbe — gemessen ist ohnehin das genauere Wort.
      accentHint: 'Leer lässt die Farbe des Themas. Vor dem Speichern messen wir den Kontrast.',
      watermark: 'Wasserzeichen',
      watermarkHint: 'Klein auf jedem Slide. Normalerweise dein Handle.',

      rulesHeading: 'Regeln',
      requireSources: 'Jeder Beitrag muss seine Quellen zeigen',
      requireSourcesHint:
        'Das macht einen Beitrag im Sinne von Instagrams Originalitätsrichtlinie eigenständig. Bei allem Tatsachenbezogenen besser an lassen.',
      publicInterest: 'Es geht um Gesundheit, Geld, Recht, Sicherheit oder Politik',
      publicInterestHint:
        'Hebt die Hürde, die eine Aussage überspringen muss, und schaltet die KI-Kennzeichnung standardmäßig ein — genau das verlangt die EU-KI-Verordnung in diesen Feldern.',
      requireAdLabel: 'Als Werbung kennzeichnen, wenn ein Beitrag einen kommerziellen Link enthält',
      requireAdLabelHint: '§ 5a UWG, für Betreiber in Deutschland. Es auszuschalten ist eine Entscheidung.',
      minConfidence: 'Wie sicher eine Aussage sein muss',
      minConfidenceHint:
        'Zwischen 0,5 und 1. Eine Kernaussage darunter hält den Beitrag zurück, und kein Kanal kann es niedriger setzen — diese Untergrenze ist es, die die Prüfung überhaupt bedeutsam hält.',
      forbiddenTopics: 'Nie darüber schreiben',
      forbiddenTopicsHint: 'Eines pro Zeile. Wird abgelehnt, während die Ideen noch entstehen.',

      promptHeading: 'Zusätzliche Anweisungen',
      promptIntro:
        'Wird an die Anweisungen eines Schritts angehängt. Für den Recherche-Schritt gibt es bewusst kein Feld: Ein Kanal darf ihm nicht sagen können, was herauskommen soll.',
      promptIdeate: 'Beim Sammeln von Ideen',
      promptWrite: 'Beim Schreiben der Slides',

      cadenceHeading: 'Wie oft',
      cadenceNotWiredUp:
        'Wird gespeichert, aber es wird noch nichts automatisch veröffentlicht. Diese Angaben werden für die spätere Serienplanung festgehalten — bis dahin planst du jeden Beitrag einzeln bei der Freigabe.',
      postsPerWeek: 'Beiträge pro Woche',
      preferredTimes: 'Bevorzugte Zeiten',
      preferredTimesHint: 'HH:mm, mit Leerzeichen getrennt.',
      timezone: 'Zeitzone',
      timezoneHint: 'Ein IANA-Name, etwa Europe/Berlin.',

      makeDefault: 'Diesen Kanal standardmäßig verwenden',
      save: 'Kanal speichern',
      saving: 'Wird gespeichert…',
      cancel: 'Abbrechen',
      problems: 'Daran muss noch etwas geändert werden, bevor es gespeichert werden kann:',
    },

    errors: {
      slugTaken: 'Ein anderer Kanal in diesem Arbeitsbereich nutzt diesen Kurznamen schon.',
      missing: 'Diesen Kanal gibt es nicht mehr.',
      describeMore: 'Gib ihm einen oder zwei Sätze, mit denen er arbeiten kann.',
      generateFailed: (detail: string) =>
        `Der Kanal ließ sich nicht entwerfen: ${detail}. Prüfe, ob in deiner .env ein Modellanbieter eingerichtet ist.`,
      generateUnusable:
        'Was zurückkam, ergäbe keinen brauchbaren Kanal. Beschreibe es etwas anders, oder fang mit einem leeren an.',
    },
  },

  /**
   * The licence banner. Reports only — no feature is gated on any of this.
   */
  license: {
    expired: (licensee: string, on: string) => `Die Lizenz für ${licensee} ist am ${on} abgelaufen.`,
    invalid: (reason: string) => `Dieser Lizenzschlüssel wurde nicht angenommen: ${reason}`,
    unverifiable: 'Es ist ein Lizenzschlüssel gesetzt, aber diesem Build fehlt der Signaturschlüssel zum Prüfen — das ist unser Verpackungsfehler, nicht deiner.',
    nothingRestricted: 'Es ist nichts eingeschränkt. Alles funktioniert genau wie vorher.',
  },

  record: {
    kicker: 'Redaktioneller Nachweis',
    backToReview: '← Zurück zur Prüfung',
    downloadJson: 'JSON herunterladen',
    downloadCsv: 'CSV herunterladen',
    printHint: 'Diese Seite drucken ergibt ein PDF.',
    untitled: 'Beitrag ohne Titel',
    summary: 'Überblick',
    postId: 'Beitrags-ID',
    created: 'Erstellt',
    approved: 'Freigegeben',
    responsibility: 'Wer die Verantwortung übernommen hat',
    notApproved: 'Noch nicht freigegeben',
    published: 'Veröffentlicht',
    igMediaId: 'Instagram-Medien-ID',
    aiDisclosure: 'KI-Kennzeichnung',
    labelled: 'Als KI-gestützt gekennzeichnet',
    notLabelled: 'Nicht gekennzeichnet',
    confidenceFloor: 'Geforderte Sicherheit',
    confidenceFloorValue: (value: string) => `${value} (vom Kanal gesetzt)`,
    claimsLabel: 'Aussagen',
    claimsValue: (checked: number, core: number, overridden: number) =>
      `${checked} nachgeschlagen · ${core} zentral · ${overridden} trotzdem akzeptiert`,
    pagesConsulted: 'Geöffnete Seiten',
    unresolved: (count: number) =>
      count === 1
        ? 'Eine Kernaussage hat die gesetzte Sicherheit nicht erreicht, und niemand hat sie trotzdem akzeptiert. Dieser Beitrag war zum Zeitpunkt dieses Nachweises nicht veröffentlichbar.'
        : `${count} Kernaussagen haben die gesetzte Sicherheit nicht erreicht, und niemand hat sie trotzdem akzeptiert. Dieser Beitrag war zum Zeitpunkt dieses Nachweises nicht veröffentlichbar.`,
    claimsTitle: (count: number) => `Aussagen und was die Quellen sagten (${count})`,
    noClaims: 'Für diesen Beitrag wurden keine Aussagen erfasst.',
    noSources: 'Keine Quellen erfasst.',
    core: 'zentral',
    overriddenBy: 'Trotzdem akzeptiert',
    overriddenByUnknown: 'eine Person, die nicht mehr in diesem Arbeitsbereich ist',
    slidesTitle: (count: number) => `Slides (${count})`,
    nothingWritten:
      'Es wurde nichts geschrieben — die Prüfung hat diesen Beitrag vor dem Schreiben gestoppt.',
    altText: 'Alt-Text:',
    editedByHand: 'Nach der Recherche von Hand geändert:',
    captionTitle: 'Bildunterschrift',
    reviewNoteTitle: 'Notiz',
    consultedTitle: (count: number) => `Geöffnete Seiten (${count})`,
    consultedIntro:
      'Alles, was die Recherche geöffnet hat — ob es am Ende zitiert wurde oder nicht.',
    producedAt: (stamp: string, id: string) =>
      `Erstellt am ${stamp} aus dem gespeicherten Datensatz für Beitrag ${id}.`,
    disclaimer:
      'Dieses Dokument hält fest, was recherchiert wurde, was die Quellen sagten und wer die redaktionelle Verantwortung übernommen hat. Es bescheinigt nicht, dass eine Aussage wahr ist.',
  },

  members: {
    title: 'Personen',
    intro:
      'Wer diesen Arbeitsbereich nutzen darf und was. Eine Einladung ist ein Link, den du selbst verschickst — eine selbst gehostete Installation hat keinen Mailserver, es wird also nichts in deinem Namen versendet.',
    people: 'In diesem Arbeitsbereich',
    pending: 'Eingeladen, noch nicht beigetreten',
    invite: 'Jemanden einladen',
    email: 'E-Mail-Adresse',
    role: 'Rolle',
    createInvite: 'Einladungslink erstellen',
    creatingInvite: 'Wird erstellt…',
    inviteReady: 'Einladung fertig. Schick diesen Link an die eingeladene Person.',
    inviteLink: 'Einladungslink',
    inviteOnce:
      'Wird nur einmal angezeigt. Wer den Link hat, tritt mit der gewählten Rolle bei — behandle ihn wie ein Passwort. Nach sieben Tagen läuft er ab.',
    inviteHint:
      'Die Person muss sich mit genau dieser Adresse anmelden oder registrieren. Setze dafür kurz ALLOW_SIGNUP=true und danach wieder zurück.',
    expires: (when: string) => `Läuft ab am ${when}`,
    revoke: 'Zurückziehen',
    revoking: 'Wird zurückgezogen…',
    remove: 'Entfernen',
    removing: 'Wird entfernt…',
    you: '(du)',
    roles: {
      owner: 'Inhaber — alles, inklusive Abrechnung',
      admin: 'Admin — alles außer Inhaberschaft',
      editor: 'Redakteur — schreiben und bearbeiten, nicht freigeben',
      viewer: 'Betrachter — nur lesen',
    },
    errors: {
      notPermitted: 'Deine Rolle erlaubt es nicht, Personen zu verwalten.',
      badEmail: 'Das sieht nicht nach einer E-Mail-Adresse aus.',
      badRole: 'Diese Rolle kannst du nicht vergeben.',
      notYourself: 'Du kannst deine eigene Rolle nicht ändern und dich nicht selbst entfernen.',
      cannotChangeOwner:
        'Der Inhaber des Arbeitsbereichs kann nicht geändert oder entfernt werden.',
    },
  },

  invite: {
    title: 'Diese Einladung konnte nicht verwendet werden.',
    joinTitle: 'Arbeitsbereich beitreten',
    joinPrompt:
      'Du bist angemeldet. Tritt dem Arbeitsbereich nur bei, wenn diese Einladung für dich bestimmt ist.',
    join: 'Arbeitsbereich beitreten',
    joining: 'Beitritt läuft…',
    activateFailed:
      'Der Arbeitsbereich wurde hinzugefügt, konnte aber nicht geöffnet werden. Versuche es noch einmal.',
    invalid:
      'Der Link ist abgelaufen, zurückgezogen oder bereits benutzt worden. Bitte um einen neuen.',
    alreadyMember: 'Du bist bereits in diesem Arbeitsbereich — es gab nichts anzunehmen.',
    wrongEmail: (invited: string, current: string) =>
      `Diese Einladung war für ${invited}, du bist aber als ${current} angemeldet. Melde dich mit der eingeladenen Adresse an oder bitte um eine Einladung für diese hier.`,
  },

  noWorkspace: {
    title: 'Du gehörst noch zu keinem Arbeitsbereich',
    explain: (email: string) =>
      `Du bist als ${email} angemeldet, gehörst aber zu keinem Arbeitsbereich. Beiträge, Kanäle und Instagram-Konten liegen alle in einem — bis du drin bist, gibt es nichts zu zeigen.`,
    pasteLabel: 'Einladungslink',
    pasteHint:
      'Wenn dich jemand eingeladen hat, füge den kompletten Link ein. Ein Link läuft sieben Tage nach dem Erstellen ab.',
    pasteAction: 'Einladung öffnen',
    pasteInvalid:
      'Das sieht nicht nach einem Einladungslink aus. Füge den vollständigen Link ein oder bitte um einen neuen.',
    startTitle: 'Oder leg einen eigenen an',
    startHint:
      'Legt einen leeren Arbeitsbereich an, den nur du siehst. Eine Einladung kannst du später trotzdem annehmen und dann wechseln.',
    startAction: 'Arbeitsbereich anlegen',
    startFailed: 'Der Arbeitsbereich konnte nicht angelegt werden. Versuche es noch einmal.',
    signOut: 'Abmelden',
  },

  workspace: {
    select: 'Arbeitsbereich wechseln',
    failed: 'Arbeitsbereich konnte nicht gewechselt werden. Versuche es noch einmal.',
  },

  errors: {
    chooseNiche: 'Wähle zuerst einen Kanal.',
    notPermitted: 'Deine Rolle in diesem Arbeitsbereich erlaubt es nicht, Beiträge zu erstellen.',
    notPermittedTopics:
      'Deine Rolle in diesem Arbeitsbereich erlaubt es nicht, Themen zu suchen.',
    pageTitle: 'Diese Seite konnte nicht geladen werden.',
    pageBody:
      'Der Fehler liegt auf dem Server, nicht in deinem Browser — neu laden hilft oft schon. Wenn es weiter passiert, steht der Grund im Terminal, in dem das Dashboard läuft.',
    pageRetry: 'Nochmal versuchen',
    pageBack: 'Zurück zur Übersicht',
    notFoundTitle: 'Diese Seite gibt es nicht.',
    notFoundBody:
      'Der Link ist vielleicht veraltet, oder was hier stand, wurde inzwischen gelöscht. Mit deinem Konto ist alles in Ordnung.',
    slideCountRange: (max: number) =>
      `Die Anzahl der Slides muss eine ganze Zahl zwischen 2 und ${max} sein.`,
    nicheMissing: 'Diesen Kanal gibt es nicht.',
    nicheInvalid: (detail: string) =>
      `Dieser Kanal lässt sich erst verwenden, wenn seine Einrichtung korrigiert ist: ${detail}`,
    generateBusy: 'Es wird bereits ein Beitrag erstellt. Warte, bis das fertig ist.',
    duplicateIdea: 'Diese Idee gab es schon einmal, sie wurde deshalb nicht erneut gespeichert. Nimm ein anderes Thema, oder lass das Thema leer für etwas Neues.',
    generateFailed: (detail: string) => `Der Beitrag konnte nicht erstellt werden: ${detail}`,
    discoverBusy: 'Eine Themensuche läuft bereits. Warte, bis sie fertig ist.',
    discoverFailed: (detail: string) => `Die Themensuche konnte nicht abgeschlossen werden: ${detail}`,
    appIdFormat:
      'Die Instagram-App-ID ist die lange Zahl aus dem Instagram-Bereich deiner Meta-App.',
    appSecretFormat:
      'Das sieht nicht nach einem Instagram-App-Secret aus. Kopiere es von derselben Seite wie die App-ID.',
    instagramDeclined: (detail: string) => `Instagram hat die Verbindung abgelehnt: ${detail}`,
    connectExpired: 'Der Verbindungsversuch ist abgelaufen. Bitte versuche es erneut.',
    connectUnverified: 'Wir konnten diese Verbindung nicht bestätigen. Bitte fange neu an.',
    connectNoPending: 'Es wartete keine Verbindung darauf, abgeschlossen zu werden. Bitte fange neu an.',
    connectNoPublish:
      'Verbunden, aber die Berechtigung zum Veröffentlichen wurde nicht erteilt. Verbinde erneut und erlaube alle drei.',
    connectFailed: (detail: string) => `Die Verbindung konnte nicht abgeschlossen werden: ${detail}`,
    connected: (username: string) => `Verbunden als @${username}.`,
  },

  appearance: {
    heading: 'Darstellung',
    theme: 'Erscheinungsbild',
    themeSystem: 'Wie mein Gerät',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    density: 'Zeilenhöhe',
    densityHelp:
      'Wie viel auf den Bildschirm passt. Kompakt zeigt mehr auf einmal; luftig lässt sich in Ruhe durchgehen.',
    densityCompact: 'Kompakt',
    densityComfortable: 'Normal',
    densitySpacious: 'Luftig',
    toggleSidebar: 'Menü einklappen',
    expandSidebar: 'Menü ausklappen',
    skipToContent: 'Zum Inhalt springen',
    loading: 'Wird geladen',
    openMenu: 'Menü öffnen',
    closeMenu: 'Menü schließen',
  },

  palette: {
    open: 'Suchen',
    placeholder: 'Wohin?…',
    noResults: 'Dazu passt nichts.',
    hint: 'Esc zum Schließen',
    goTo: 'Gehe zu',
    setupTitle: 'Veröffentlichen einrichten',
  },

  gate: {
    claim_false: (p) =>
      p['scope'] === 'incidental'
        ? `Die Quellen sprechen dagegen, und es ist nicht zentral — nimm es raus: „${p['claim']}“`
        : `Die Quellen sprechen gegen eine Kernaussage: „${p['claim']}“`,
    claim_unverifiable: (p) => `Für eine Kernaussage wurde keine brauchbare Quelle gefunden: „${p['claim']}“`,
    claim_low_confidence: (p) =>
      `Eine Kernaussage ist weniger sicher, als dieser Kanal zulässt (${p['confidence']}, gefordert ${p['floor']}): „${p['claim']}“`,
    claim_unsourced: (p) => `Eine Kernaussage hat keine Quelle, auf die sie zeigt: „${p['claim']}“`,
    claim_disputed: (p) =>
      `Die Quellen widersprechen sich, das muss als strittig geschrieben werden: „${p['claim']}“`,
    claim_resolved_by_human: (p) =>
      `Jemand hat das trotzdem akzeptiert, obwohl die Quellen „${p['verdict']}“ sagen: „${p['claim']}“`,
    not_verified: () => 'Für diesen Beitrag wurde noch nichts in Quellen nachgeschlagen.',
    caption_too_long: (p) =>
      `Die Bildunterschrift hat ${p['length']} Zeichen. Instagram erlaubt ${p['max']}.`,
    too_many_hashtags: (p) => `${p['count']} Hashtags. Instagram erlaubt ${p['max']}.`,
    missing_alt_text: (p) => `Slide ${p['slide']} hat keinen Alt-Text.`,
    slide_count: (p) => `${p['count']} Slides. Ein Karussell braucht zwischen 2 und 10.`,
    plan_mismatch: (p) =>
      `Der Beitrag hat ${p['actual']} Slides, das Layout hat ${p['expected']} erwartet.`,
    role_mismatch: (p) =>
      `Slide ${p['slide']} ist ein „${p['actual']}“-Slide, wo das Layout „${p['expected']}“ erwartet hat.`,
    slide_edited_after_check: (p) =>
      `Slide ${p['slide']} wurde nach dem Nachschlagen von Hand geändert. Was die Quellen unten sagen, wurde gegen die frühere Formulierung gelesen.`,
    hook_not_first: (p) =>
      `Der Beitrag beginnt mit einem „${p['role']}“-Slide statt mit dem Aufhänger. Slide eins ist das einzige, das die meisten überhaupt sehen.`,
    no_account: () => 'Für diesen Beitrag ist kein Instagram-Konto hinterlegt. Wähle eines im Kanal aus.',
    account_not_connected: (p) => `Das Konto @${p['username']} ist „${p['status']}“ statt verbunden — Veröffentlichen würde fehlschlagen. Verbinde es in den Einstellungen neu.`,
    missing_sources_slide: () =>
      'Dieser Kanal verlangt, dass jeder Beitrag seine Quellen zeigt — es gibt aber kein Quellen-Slide.',
    ad_label_required: () =>
      'Dieser Beitrag enthält einen kommerziellen Link und muss vor der Veröffentlichung als Werbung gekennzeichnet werden (§ 5a UWG).',
  },

  runNotes: {
    sourceUnavailable: (p) => `${p['source']} war nicht erreichbar: ${p['reason']}`,
    trendingCapped: (p) =>
      `${p['available']} Trend-Begriffe standen zur Verfügung; nachgeschlagen wurden die ersten ${p['used']}, weil jeder eine Anfrage vom Limit kostet.`,
    seedsCapped: (p) =>
      `Dieser Kanal nennt ${p['available']} Themenfelder; nachgeschlagen wurden die ersten ${p['used']}. Jedes kostet eine Anfrage vom Limit.`,
    forbiddenDropped: (p) =>
      `${p['count']} Vorschläge betrafen Themen, die dieser Kanal ausschließt, und wurden vor der Messung verworfen.`,
    livingCheckFailed: (p) =>
      `Die kostenlose Prüfung auf lebende Personen lief nicht (${p['reason']}). Diese Vorschläge wurden deshalb gemessen und erst danach abgelehnt.`,
    livingDropped: (p) =>
      `${p['count']} Vorschläge wurden vor der Messung verworfen, weil es lebende Personen sind. Diese Prüfung kostet zwei Anfragen und spart eine je Vorschlag — deshalb füllt die Liste der meistgelesenen Artikel das Budget nicht einfach mit denen, die gestern in den Nachrichten waren.`,
    budgetCapped: (p) =>
      `${p['gathered']} Vorschläge kamen zusammen, gemessen wurden ${p['measured']}; der Rest bleibt für einen späteren Durchlauf. Das Budget gibt es, weil das Anfragelimit bewusst niedrig ist — höher heißt entsprechend länger.`,
    measureFailed: (p) => `„${p['title']}“ ließ sich nicht messen: ${p['reason']}`,
  },

  status: {
    idea: 'Idee',
    drafted: 'Entwurf',
    // Nicht "geprüft": recherchiert und belegt ist, was tatsächlich passiert ist.
    checked: 'Recherchiert',
    rendered: 'Bilder fertig',
    review: 'Wartet auf Freigabe',
    approved: 'Freigegeben',
    scheduled: 'Geplant',
    publishing: 'Wird veröffentlicht',
    published: 'Veröffentlicht',
    failed: 'Fehlgeschlagen',
    rejected: 'Gestoppt',
  },
}
