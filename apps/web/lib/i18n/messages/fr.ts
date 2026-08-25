import type { Messages } from './en.ts'

/**
 * French interface text.
 *
 * Tutoiement throughout, as is normal for tools aimed at creators.
 *
 * The same wording rule holds: nothing here says a post is "vérifié",
 * "factuel" or "exact". The product researches, cites and blocks — those are
 * the verbs, in every language.
 *
 * Written by a non-native speaker and worth a native review before release.
 */
export const fr: Messages = {
  common: {
    back: 'Retour',
    continue: 'Continuer',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saved: 'Enregistré',
    dismiss: 'Masquer',
    restore: 'Réafficher',
    open: 'Ouvrir',
    finish: 'Terminer',
    copy: 'Copier',
    copied: 'Copié',
    copyManualHint:
      'Ton navigateur n’a pas laissé la page copier ceci. Le texte est sélectionné — appuie sur Ctrl+C (⌘C sur Mac). Les navigateurs n’autorisent la copie qu’en https, ou sur localhost.',
    optional: 'facultatif',
    none: 'Aucun',
    yes: 'Oui',
    no: 'Non',
    loading: 'En cours…',
  },

  nav: {
    board: 'Tableau',
    topics: 'Sujets',
    generate: 'Créer',
    niches: 'Chaînes',
    members: 'Personnes',
    settings: 'Réglages',
    backToBoard: '← Retour au tableau',
    landmark: 'Navigation principale',
  },

  signIn: {
    title: 'Connexion',
    subtitle: 'Connecte-toi à ton espace de travail.',
    email: 'E-mail',
    password: 'Mot de passe',
    submit: 'Se connecter',
    noAccount: 'Pas encore de compte ?',
    createOne: 'En créer un',
    signingIn: 'Connexion…',
    name: 'Ton nom',
    signUpSubtitle: 'Crée ton espace de travail.',
    invitedSignUpSubtitle: 'Crée ton compte pour rejoindre l’espace de travail auquel tu es invité.',
    passwordHint: 'Au moins 12 caractères.',
    createAccount: 'Créer le compte',
    haveAccount: 'Tu as déjà un compte ? Se connecter',
    workspaceNameTemplate: 'Espace de travail de {owner}',
  },

  board: {
    title: 'Tableau',
    createPost: 'Créer une publication',
    columns: {
      review: 'En attente de toi',
      approved: 'Approuvé',
      scheduled: 'Programmé',
      published: 'Publié',
      closed: 'Arrêté',
    },
    unresolved: (count: number) => (count === 1 ? '1 à voir' : `${count} à voir`),
    slideCount: (count: number) => (count === 1 ? '1 diapo' : `${count} diapos`),
    capped: (count: number) =>
      `Les ${count} derniers modifiés sont affichés. Les nombres comptent tout.`,
    empty: {
      title: 'Aucune publication pour l’instant.',
      body: 'Crées-en une et regarde faire : une idée est esquissée, chaque fait qu’elle contient est recherché dans de vraies sources, et ce n’est qu’ensuite que quoi que ce soit est écrit.',
      createFirst: 'Créer ta première publication',
      setUpPublishing: 'Configurer la publication',
      notConnected:
        'Aucun compte Instagram n’est encore connecté : tu peux créer et relire une publication, mais pas la publier. La connexion prend une dizaine de minutes.',
    },
  },

  generate: {
    title: 'Créer une publication',
    intro:
      'Quatre idées sont esquissées, la meilleure est retenue, et chaque fait qu’elle contient est recherché dans de vraies sources. Cette recherche a lieu avant que quoi que ce soit ne soit écrit — une idée qui ne tient pas ne te coûte donc jamais une publication terminée.',
    niche: 'Chaîne',
    nicheHelp:
      'La chaîne définit la langue, le ton, les mises en page des diapos, et le niveau de certitude exigé avant qu’un fait puisse être utilisé.',
    topic: 'Sujet',
    topicPlaceholder: 'Laisse vide et un sujet sera choisi pour toi',
    topicFromDiscovery:
      'Repris d’un sujet trouvé pour toi. Modifie-le librement — c’est un point de départ, pas un titre.',
    slides: 'Nombre de diapos',
    slidesPlaceholder: 'Laisser la mise en page décider',
    slidesHelp: (max: number) =>
      `Instagram autorise jusqu’à ${max} diapos. Chaque mise en page fonctionne au mieux dans sa propre plage.`,
    submit: 'Créer',
    working: 'Création…',
    cost:
      'Cela prend environ une minute et coûte à peu près 0,40 $. Garde cet onglet ouvert.',
    stages: [
      'Recherche d’idées',
      // Pas « vérification » : ce qui se passe, c'est une recherche documentée.
      'Recherche de chaque fait dans de vraies sources',
      'Décision : est-ce que cela tient ?',
      'Rédaction des diapos',
    ],
    gateNote:
      'Si les faits ne tiennent pas, rien n’est rédigé. Tu arrives sur une publication arrêtée qui montre exactement quelle affirmation a échoué et ce qui a été cherché.',
    noNiche: {
      title: 'Aucune chaîne configurée.',
      body: 'Une chaîne contient la langue, le ton, les mises en page et tes règles.',
      seedHint: (command: string) => `Lance ${command} pour ajouter celle d’exemple.`,
    },
    problems: 'Ces chaînes ne sont pas encore utilisables :',
    misconfigured: 'à corriger',
    formats: (count: number) => (count === 1 ? '1 mise en page' : `${count} mises en page`),
    recentRuns: 'Récemment',
    spend: (runs: number, usd: string) =>
      `${runs} publication${runs === 1 ? '' : 's'} créée${runs === 1 ? '' : 's'} ces 30 derniers jours, pour environ ${usd} $ d’appels de modèle.`,
    alreadyRunning: 'Une publication est en cours de création.',
    alreadyRunningSince: (at: Date, locale: string) =>
      `Démarré à ${at.toLocaleTimeString(locale)}. Le traitement continue même si tu quittes cette page — une fois terminé, la nouvelle publication apparaît sous « Récemment » ci-dessous et sur le tableau.`,
    language: (language: string) => `Sera rédigé en ${language}`,
  },

  topics: {
    title: 'Sujets',
    intro: (durabilityPercent: number) =>
      `Des sujets qui méritent d’être traités, trouvés dans des sources publiques et gratuites : les compteurs de consultation de Wikipédia, les listes de tendances publiées et les index d’actualité ouverts. Ils sont classés selon qu’ils vaudront encore la peine d’être lus l’an prochain — c’est ${durabilityPercent} % de la note. Être dans l’actualité peut faire monter un bon sujet, jamais sauver un mauvais.`,
    niche: 'Chaîne',
    discover: 'Chercher des sujets',
    colTopic: 'Sujet',
    colViews: 'Vues / mois',
    colLinks: 'Sources',
    colScore: 'Note',
    colWhy: 'Pourquoi',
    colActions: 'Actions',
    working: 'Recherche…',
    waitTitle: 'Cela prend quelques minutes et ne coûte rien. Garde cet onglet ouvert.',
    waitBody:
      'Toutes les sources ici sont gratuites, et nous demandons volontairement au plus dix pages par minute — bien moins que ce qu’elles autorisent. L’attente, c’est de la politesse, pas une file. Les données de consultation de Wikipédia sont gérées par une association, et les outils qui les martèlent sont la raison pour laquelle les services ouverts finissent par fermer.',
    waitCached:
      'Les résultats sont conservés, la prochaine recherche sera donc bien plus rapide. Rien n’est rédigé ni publié ici — cette étape décide seulement de ce qui mérite un coup d’œil.',
    aboutLastRun: 'À propos de la dernière recherche',
    accepted: 'Ça vaut le coup',
    acceptedEmpty: 'Rien n’est passé cette fois.',
    recommended: 'Recommandés pour cette chaîne',
    recommendedEmpty: 'Aucun sujet ne correspond étroitement à cette chaîne cette fois.',
    explore: 'À explorer au-delà de ta chaîne',
    exploreEmpty: 'Aucune idée plus large cette fois.',
    exploreNote:
      'Ces sujets ont passé les règles de sécurité, mais ne partagent pas encore le vocabulaire de ta chaîne. Ce sont des pistes à explorer, pas des recommandations.',
    rejected: 'Mis de côté',
    rejectedEmpty: 'Rien n’a été mis de côté.',
    rejectedNote:
      'Conservé, avec la raison. Un sujet écarté pour un motif limite est exactement celui sur lequel tu pourrais ne pas être d’accord — tu le vois donc, et tu décides.',
    dismissed: 'Masqués',
    dismissedEmpty: 'Rien de masqué.',
    showDismissed: 'Afficher les sujets masqués',
    empty:
      'Rien de trouvé pour cette chaîne pour l’instant. La première recherche prend quelques minutes, parce que nous restons largement en deçà de ce que les sources gratuites permettent.',
    noNiche: {
      title: 'Aucune chaîne configurée.',
      body: 'Les sujets sont notés par rapport à la langue et aux domaines d’une chaîne : il en faut donc une d’abord.',
    },
    viewsPerMonth: (views: string) => `${views} consultations par mois`,
    links: (count: number) => (count === 1 ? '1 lien source' : `${count} liens sources`),
    linksHelp: (floor: number) =>
      `Liens sortants de l’article Wikipédia. Nous écartons tout ce qui en compte moins de ${floor} : un article mince donne rarement de quoi travailler.`,
    trending: 'dans l’actualité',
    alreadyUsed: 'Déjà utilisé',
    generate: 'Créer une publication',
    article: 'Lire l’article',
    scoreHelp:
      'Note globale. L’échelle monte à 1,30 une fois l’attention du moment prise en compte.',
    breakdown: (parts) =>
      `Intérêt durable ${parts.lasting} · recherché ${parts.interest} · sources disponibles ${parts.sources} · correspond à ta chaîne ${parts.fit}`,
    recencyBoost: (multiplier: string) => `×${multiplier} pour l’actualité`,
    reasons: {
      'too-few-references': 'pas assez de sources',
      'disputed-or-outdated': 'signalé par les rédacteurs de Wikipédia',
      'living-person': 'personne vivante',
      ymyl: 'santé, argent ou droit',
      'too-new': 'article très récent',
      'single-recent-spike': 'fait d’actualité isolé',
      'no-article': 'aucun article trouvé',
    },
  },

  niches: {
    title: 'Chaînes',
    intro:
      'Une chaîne, c’est toute ta configuration : la langue, pour qui tu écris, le ton, les mises en page que tu utilises et tes règles. Tout se modifie sans toucher au code.',
    language: 'Langue',
    audience: 'Écrit pour',
    voice: 'Ton',
    formats: 'Mises en page',
    seeds: 'Domaines',
    rules: 'Règles',
    minConfidence: 'Certitude exigée pour un fait',
    requireSources: 'Chaque publication doit montrer ses sources',
    publicInterest: 'Indiquer que la publication est assistée par IA',
    forbidden: 'Ne jamais traiter',
    cadence: 'Fréquence de publication',
    postsPerWeek: (count: number) =>
      count === 1 ? '1 publication par semaine' : `${count} publications par semaine`,
    default: 'Par défaut',
    theme: 'Apparence',
    invalid: (detail: string) =>
      `La configuration de cette chaîne n'est pas valide, elle ne peut donc pas encore servir : ${detail}`,
    neverCovers: 'Ne traite jamais :',
    empty: {
      title: 'Aucune chaîne pour l’instant.',
      body: (command: string) => `Lance ${command} pour ajouter la chaîne d’exemple.`,
    },
    footer:
      'Les chaînes partent des exemples présents dans le code et vivent ensuite dans la base de données.',
    footerLink: 'Créer une publication avec',
  },

  settings: {
    title: 'Réglages',

    account: {
      heading: 'Ton compte',
      name: 'Ton nom',
      nameHint: 'Figure au dossier éditorial des publications que tu approuves.',
      email: 'E-mail',
      emailHint: 'Ce avec quoi tu te connectes.',
      saveProfile: 'Enregistrer',
      saving: 'Enregistrement…',
      profileSaved: 'Enregistré.',

      passwordHeading: 'Changer le mot de passe',
      currentPassword: 'Mot de passe actuel',
      currentPasswordHint:
        'Demandé parce qu’une session laissée ouverte sur une machine partagée ne doit pas suffire à t’enfermer dehors de ton propre compte.',
      newPassword: 'Nouveau mot de passe',
      newPasswordHint: 'Au moins 12 caractères.',
      confirmPassword: 'Nouveau mot de passe à nouveau',
      changePassword: 'Changer le mot de passe',
      passwordChanged: 'Mot de passe changé. Tes autres sessions ont été déconnectées.',
      signOutOthers: 'Se déconnecter partout ailleurs',
      signOutOthersHint: 'Met fin à toutes les sessions sauf celle-ci.',

      errors: {
        nameEmpty:
          'Donne un nom — c’est ce que le dossier éditorial affiche pour les publications que tu approuves.',
        emailInvalid: 'Cela ne ressemble pas à une adresse e-mail.',
        emailTaken: 'Un autre compte ici utilise déjà cette adresse.',
        wrongPassword: 'Ce n’est pas ton mot de passe actuel.',
        tooShort: (min: number) => `Un mot de passe demande au moins ${min} caractères.`,
        mismatch: 'Les deux nouveaux mots de passe ne sont pas identiques.',
        sameAsOld: 'C’est le mot de passe que tu as déjà.',
        failed: 'Cela n’a pas pu être enregistré. Réessaie.',
      },
    },

    language: {
      heading: 'Langue',
      interface: 'Langue du tableau de bord',
      interfaceHelp:
        'Ce que tu vois ici : boutons, libellés et textes d’aide. Cela ne change rien aux publications déjà créées.',
      output: 'Langue des nouvelles chaînes',
      outputHelp:
        'Les nouvelles chaînes démarrent dans cette langue. Celles qui existent gardent la leur — c’est ainsi qu’un même compte peut tenir une chaîne allemande et une chaîne anglaise en parallèle.',
      followInterface: 'Comme le tableau de bord',
      saved: 'Langue enregistrée.',
    },
    readiness: {
      usedByChannels: (names: string) =>
        `Publie pour : ${names}. Si ce compte est déconnecté ou ses données supprimées, ces chaînes ne peuvent plus publier tant qu’un autre compte ne leur est pas attribué.`,
      heading: 'Avant de pouvoir publier',
      guidedSetup: 'Guide-moi →',
      appUrl: 'Adresse publique pour les retours Meta',
      images: 'Instagram peut atteindre les images de tes diapos',
      imagesNotSet: 'Pas encore configuré',
      account: 'Compte Instagram connecté',
      accountNone: 'Pas encore connecté',
      token: 'La connexion est active',
      tokenNone: 'Pas encore connecté',
      tokenDays: (days: number) =>
        `Se renouvelle automatiquement. ${days} jours restants sur la connexion actuelle.`,
      imagesWarning:
        'Instagram charge les images de tes diapos depuis ses propres serveurs : elles doivent donc se trouver à une adresse web publique. Une adresse locale fonctionne ici et échoue au moment précis où tu publies.',
    },
    connect: {
      headingNew: 'Connecter Instagram',
      headingExisting: 'Reconnecter Instagram',
      intro:
        'Claimfold utilise ta propre application Meta, pas la nôtre. C’est ce qui t’évite la procédure d’examen de Meta — pas de demande, pas de vérification d’entreprise, pas d’attente. Crée une application sur {link}, ajoutes-y Instagram, et inscris ton propre compte Instagram comme utilisateur.',
      stepByStep: 'Plutôt étape par étape',
      redirectLabel: 'Adresse de retour à ajouter à ton application Meta',
      appId: 'ID d’application Instagram',
      appSecret: 'Secret d’application Instagram',
      secretNote: 'Chiffré avant d’être enregistré, et jamais réaffiché.',
      submitNew: 'Connecter Instagram',
      submitExisting: 'Reconnecter',
    },
  },

  setup: {
    stepDone: 'terminé',
    title: 'Configurer la publication',
    stepOf: (step: number, total: number) => `Étape ${step} sur ${total}`,
    notChecked: 'Nous ne pouvons pas le vérifier d’ici.',
    doneContinue: 'C’est fait — continuer',
    skipForNow: 'Passer pour l’instant',
    steps: {
      account: { short: 'Compte', title: 'Un compte professionnel' },
      metaApp: { short: 'Application Meta', title: 'Ta propre application Meta' },
      redirect: { short: 'Adresse de retour', title: 'Ajouter l’adresse de retour' },
      connect: { short: 'Connexion', title: 'Connecter ton compte' },
      ready: { short: 'Prêt', title: 'Prêt à publier' },
    },
    account: {
      body: 'Instagram n’autorise la publication par une application que sur un compte professionnel — Business ou Créateur. Un compte personnel est refusé, et tu ne l’apprends qu’au moment de publier. Autant s’en occuper en premier.',
      how: 'Cela se change dans l’application Instagram elle-même, dans les réglages de ton compte. C’est gratuit et réversible.',
      unverifiable:
        'Nous ne voyons pas le type de ton compte tant que tu n’es pas connecté. Si cette étape manque, cela apparaît à l’étape 4 comme une connexion échouée, pas comme un avertissement maintenant.',
    },
    metaApp: {
      body: 'Claimfold parle à Instagram en tant que ton application, pas la nôtre. Crées-en une sur {link}, ajoutes-y Instagram, et choisis la connexion Instagram plutôt que celle de Facebook — ainsi tu n’as pas besoin de Page Facebook.',
      roleHolder:
        'Inscris ensuite ton propre compte Instagram comme utilisateur de l’application. C’est l’étape qui te fait gagner des semaines : une application qui ne touche que des comptes qui lui sont rattachés n’a pas besoin de l’examen de Meta. Si tout le monde partageait une seule application, Meta exigerait un examen complet avant ta première publication.',
      reference: 'Documentation de Meta :',
      unverifiable: 'Ce que contient ton application Meta, cette installation ne peut pas le voir.',
    },
    redirect: {
      alsoRequired:
        'Meta exige aussi ces deux adresses avant d’autoriser l’enregistrement de l’app. Ce sont de vrais points d’entrée de cette installation : la première sert à Instagram pour signaler qu’un compte a été déconnecté, la seconde à une personne pour demander la suppression de ses données.',
      deauthorizeLabel: 'URL de rappel de déconnexion',
      dataDeletionLabel: 'URL de demande de suppression des données',
      body: 'Ajoute cette adresse web à ton application Meta comme URI de redirection — l’adresse vers laquelle Instagram te renvoie après que tu as accepté la connexion. Meta compare caractère par caractère : une barre oblique manquante ou http au lieu de https suffit à tout casser, et le message d’erreur ne te le dira pas. Copie-la plutôt que de la retaper.',
      localWarning:
        'Cela pointe vers ton propre ordinateur, ce qui convient le temps de la configuration. Pour publier réellement, il te faut une adresse web publique — quand tu en auras une, renseigne APP_URL et ajoute aussi la nouvelle adresse dans l’application Meta. Meta compare à l’identique : c’est une seconde entrée, pas un remplacement.',
      unverifiable:
        'Savoir si Meta l’a bien enregistrée ne se vérifie qu’en essayant, c’est-à-dire à l’étape suivante.',
    },
    connect: {
      connected: (username: string) =>
        `Connecté en tant que @${username}. Se reconnecter remplace cela — pratique si la connexion ne fonctionne plus ou si tu changes de compte.`,
      body: 'Colle les deux valeurs, puis accepte la connexion. Tu seras envoyé sur Instagram, on te demandera trois autorisations, et tu reviendras directement ici.',
      warningTitle: 'Pas l’App ID en haut de la page',
      warningBody:
        'La connexion Instagram utilise l’ID et le secret d’application Instagram, qui appartiennent à la section Instagram à l’intérieur de ton application Meta — pas l’App ID Meta affiché dans l’en-tête. Ce sont deux longs nombres : coller le mauvais échoue avec un message qui ne nomme ni l’un ni l’autre. Si la connexion échoue et que l’erreur reste vague, commence par vérifier ceci.',
      warningRelabel:
        'Meta renomme souvent les choses sur ce tableau de bord. Cherche donc la page de configuration de la section Instagram — celle qui demande aussi l’adresse de retour — plutôt qu’un menu portant un nom précis.',
    },
    ready: {
      allGood:
        'Tout ce qu’il faut est en place. Rien ne se publie tout seul — une publication doit encore tenir et être approuvée par toi.',
      canary:
        'Avant de programmer une vraie publication, publie un carrousel de test approuvé sur un compte de test et observe-le sur Instagram. La liste de contrôle du canari en direct, dans la documentation, indique quoi regarder.',
      blocked:
        'La publication est bloquée tant que chaque ligne ci-dessus n’est pas au vert. Programmer avant cela signifie un échec au moment exact où la publication devait paraître, quand personne ne regarde.',
    },
  },

  review: {
    scheduledFor: (when: string) => `Programmé pour ${when}.`,
    scheduledSoon: 'Part dès que le worker le prend en charge.',
    rescheduleTo: 'Déplacer au',
    reschedule: 'Déplacer',
    rescheduling: 'Déplacement…',
    unschedule: 'Retirer de la programmation',
    unscheduling: 'Retrait…',
    unscheduleHint:
      'Le retirer renvoie la publication en relecture. Rien n’est supprimé.',
    title: 'Relecture',
    record: 'Sources et décisions',
    reject: 'Arrêter cette publication',
    approve: 'Approuver',
    approveNow: 'Approuver et publier maintenant',
    approveScheduled: 'Approuver et programmer',
    approveBlocked: 'Règle d’abord les points ci-dessous',
    rejectReason: 'Pourquoi (facultatif)',
    rejectReasonPlaceholder: 'Consigné au dossier éditorial',
    viewOnInstagram: 'Voir sur Instagram',
    performance: 'Résultats',
    metricSaved: 'Enregistrements',
    metricShares: 'Partages',
    metricReach: 'Portée',
    metricComments: 'Commentaires',
    metricLikes: 'J’aime',
    metricFollows: 'Nouveaux abonnés',
    metricAsOf: 'Mesuré',
    reviewNote: 'Note',
    loadingTitle: 'Chargement de la publication…',
    publishProblem: 'Problème de publication',
    attemptCount: (n: number) => `${n} tentatives`,
    slides: 'Diapos',
    noSlides:
      'Rien n’a été rédigé. La recherche a arrêté cette publication avant l’écriture, il n’y a donc pas de diapos — les raisons sont ci-dessus, et chaque source ouverte figure au dossier.',
    noSlidesAction: 'Ouvrir le dossier',
    noClaims: 'Aucune affirmation n’a été enregistrée : il n’y a donc rien sur quoi fonder une approbation.',
    caption: 'Légende',
    captionCount: (used: number, max: number) => `${used} sur ${max} caractères`,
    noAltText: 'pas de texte alternatif',
    evidence: (count: number) =>
      count === 1 ? 'Sur quoi cela repose · 1 affirmation' : `Sur quoi cela repose · ${count} affirmations`,
    core: 'affirmation clé',
    ready: 'Prêt à publier',
    blocked: (count: number) =>
      count === 1 ? 'Bloqué — 1 point à régler' : `Bloqué — ${count} points à régler`,
    allGood: 'Chaque affirmation clé a des sources et dépasse la certitude que tu as fixée.',
    overridden: 'Quelqu’un l’a accepté malgré tout',
    overridePlaceholder: 'Pourquoi est-ce acceptable malgré tout ?',
    override: 'Accepter quand même',
    publishAt: 'Publier le',
    publishAtHint: 'Laisse vide pour publier dès que possible.',
    approving: 'Approbation…',
    rejecting: 'Arrêt en cours…',
    overriding: 'Enregistrement…',
    publishesTo: 'Publie sur',
    publishesToNone: 'Aucun compte — impossible de publier',
    changeAccount: 'Changer',
    accountFromChannel: 'Repris de la chaîne. Le changer ici ne concerne que cette publication.',
    unusableLink: 'lien impossible à ouvrir',

    edit: {
      open: 'Modifier',
      cancel: 'Annuler',
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      tabText: 'Texte',
      tabLook: 'Apparence',
      altText: 'Texte alternatif',
      altTextHint:
        'Décrit la diapositive pour les lecteurs d’écran, et Instagram l’indexe. Indispensable avant de pouvoir approuver.',
      headline: 'Titre',
      body: 'Texte',
      kicker: 'Surtitre',
      footnote: 'Note de bas',
      figure: 'Chiffre',
      figureBadge: 'Numéro de position',
      figureDate: 'Date',
      figureLabel: 'Ce que mesure le chiffre',
      items: 'Lignes',
      panelTop: 'Panneau du haut',
      panelBottom: 'Panneau du bas',
      addLine: 'Ajouter une ligne',
      removeLine: 'Retirer cette ligne',
      layout: 'Mise en page',
      layoutInherit: 'Comme le reste de la publication',
      layoutFixed:
        'Les diapositives d’ouverture, de sources et de clôture sont identiques quelle que soit la mise en page, pour que le carrousel se lise comme un ensemble.',
      layouts: {
        editorial: 'Éditorial',
        split: 'Deux panneaux',
        list: 'Numéroté',
        timeline: 'Chronologie',
        figure: 'Grand chiffre',
        photo: 'Photo',
      },
      picture: 'Image',
      pictureNone: 'Aucune image',
      pictureOption: 'Image {n}',
      pictureUpload: 'Téléverser une image',
      pictureUploading: 'Téléversement…',
      pictureRecent: 'Déjà téléversées',
      pictureRemove: 'Retirer l’image',
      pictureHint:
        'Le texte ne repose jamais directement sur la photo : il repose sur un voile de la couleur du thème, pour rester lisible quoi que fasse l’image à cet endroit.',
      moveUp: 'Vers le début',
      moveDown: 'Vers la fin',
      remove: 'Supprimer cette diapositive',
      add: 'Ajouter une diapositive',
      addHere: 'Insérer une diapositive ici',
      addRole: 'Type de diapositive',
      appearance: 'L’allure de toutes les diapositives',
      theme: 'Thème',
      accent: 'Couleur d’accent',
      accentHint: 'Vide garde celle du thème.',
      watermark: 'Filigrane',
      watermarkHint: 'Affiché en petit sur chaque diapositive. En général votre identifiant.',
      apply: 'Appliquer',
      applying: 'Application…',
      editedByHand: 'modifiée à la main',
      caption: 'Légende',
      hashtags: 'Hashtags',
      hashtagsHint:
        'Séparés par des espaces ou des virgules. Trois à cinq pertinents valent mieux que trente.',
      firstComment: 'Premier commentaire',
      firstCommentHint: 'Publié comme commentaire juste après la parution. Bon endroit pour les sources, qui ne mangent alors pas la première ligne de la légende.',
      hook: 'Accroche',
      hookHint:
        'Enregistrée à part, pour voir quelles ouvertures amènent des enregistrements.',
    },

    editErrors: {
      alreadyPublishing:
        'Cette publication est en cours de publication et ne peut plus être modifiée. Attends la fin.',
      badSchedule: 'Ce n’est pas une date et une heure valides.',
      overrideTooShort:
        'Donne une justification d’au moins 10 caractères. Elle est consignée à ton nom dans le dossier de preuves : elle doit dire quelque chose.',
      stale:
        'Quelqu’un a modifié cette diapositive pendant qu’elle était ouverte chez vous. Rien n’a été enregistré — rechargez et réessayez.',
      missing: 'Cette diapositive ne fait plus partie de cette publication.',
      notEditable:
        'Une publication programmée ou déjà partie ne peut pas être modifiée. Arrêtez-la d’abord si vous devez y toucher.',
      notPermitted:
        'Ton rôle dans cet espace de travail ne le permet pas. Un propriétaire ou un admin peut le changer dans la liste des membres.',
      shapeChanged:
        'Le carrousel a changé pendant que vous le regardiez. Rien n’a été enregistré — rechargez et réessayez.',
      tooFew:
        'Un carrousel a besoin d’au moins deux diapositives, celle-ci ne peut donc pas partir.',
      tooMany: (max: number) => `Instagram accepte au plus ${max} diapositives.`,
      badField:
        'Le formulaire contenait un champ que cette mise en page n’utilise pas : rien n’a été enregistré.',
      accentNotAColour: 'Donnez la couleur en hexadécimal, par exemple #B4472B.',
      accentUnreadable: (ratio: string, floor: string) =>
        `Cette couleur n’atteint que ${ratio}:1 face au thème, et le texte a besoin de ${floor}:1 pour rester lisible à bout de bras.`,
      uploadTooLarge: (mb: number) => `Cette image dépasse ${mb} Mo.`,
      uploadNotAnImage: 'Ce fichier n’a pas pu être lu comme une image.',
      uploadMissing: 'Aucune image n’était joint.',
      noRole: 'Choisissez le type de diapositive à ajouter.',
    },
    verdicts: {
      supported: 'les sources concordent',
      disputed: 'les sources divergent',
      false: 'les sources contredisent',
      unverifiable: 'aucune bonne source trouvée',
    },
  },

  channels: {
    create: 'Nouvelle chaîne',
    createTitle: 'Nouvelle chaîne',
    editTitle: 'Modifier la chaîne',
    edit: 'Modifier',
    duplicate: 'Dupliquer',
    archive: 'Mettre de côté',
    restore: 'La remettre en service',
    archivedHeading: 'Mises de côté',
    archivedNote:
      'Une chaîne mise de côté est masquée du tableau et ne peut plus produire de publications. Rien n’est supprimé — les publications qu’elle a faites gardent leur dossier.',
    saved: 'Chaîne enregistrée.',
    generatedBanner:
      'Esquissée à partir de ta description. Relis-la avant de t’en servir : le niveau de certitude exigé et les sujets qu’elle refuse sont tous les deux réglés ici.',
    copyOf: (name: string) => `${name} (copie)`,

    generator: {
      heading: 'Décris une chaîne en une phrase',
      hint: 'De quoi parle-t-elle, pour qui, et comment doit-elle sonner à peu près ? Deux phrases suffisent.',
      placeholder:
        'Des publications en français sur les idées reçues en histoire, pour des adultes curieux qui aiment être surpris.',
      language: 'Rédigée en',
      submit: 'Esquisser une chaîne',
      working: 'Esquisse en cours…',
      cost:
        'Un appel au modèle, quelques centimes. Tu arrives sur l’éditeur et rien n’est utilisé avant que tu enregistres.',
    },

    form: {
      identityHeading: 'Identité',
      name: 'Nom',
      slug: 'Nom court',
      slugHint:
        'Minuscules, chiffres et tirets. Utilisé dans les liens, jamais montré à un lecteur.',
      description: 'Description',
      descriptionHint: 'Une note pour toi. Non transmise au modèle.',
      language: 'Langue des publications',
      languageHint:
        'Une étiquette BCP-47 : de, en, pt-BR. Décide la langue de rédaction, et aussi la césure, les dates et les nombres.',

      voiceHeading: 'Ton',
      audience: 'Écrit pour',
      audienceHint:
        'Repris mot pour mot dans chaque instruction, donc écris-le comme une consigne et non comme un argumentaire. « Des débutants qui ont déjà les outils et butent toujours sur les trois mêmes problèmes » est utile ; « tous ceux qui aiment le bricolage » ne l’est pas.',
      voice: 'Comment cela doit sonner',
      voiceHint: 'Repris mot pour mot aussi, à l’étape de rédaction.',

      whatHeading: 'Ce qu’elle produit',
      topicSeeds: 'Domaines',
      topicSeedsHint:
        'Un par ligne. Des domaines pouvant porter chacun plusieurs publications, pas des titres de publications.',
      formats: 'Mises en page',
      formatsHint:
        'Au moins une. Une mise en page décrit la forme d’un raisonnement — une affirmation et sa preuve, une liste ordonnée, un avant et un après — donc n’importe quel sujet entre dans n’importe laquelle.',
      hashtagSets: 'Jeux de hashtags',
      hashtagSetsHint:
        'Un jeu par ligne, séparés par des espaces. Depuis la fin du suivi de hashtags ce sont des métadonnées de recherche : trois à cinq pertinents valent mieux que trente.',

      account: 'Publie sur',
      accountHint: 'Sur quel compte Instagram connecté cette chaîne publie. Choisi ici plutôt que par publication, pour que le filigrane et le compte ne nomment jamais deux identifiants différents.',
      accountNone: 'Aucun compte choisi',
      accountNoneAvailable: 'Aucun compte Instagram n’est encore connecté. Connectes-en un dans les Réglages, puis reviens le choisir ici.',
      lookHeading: 'Apparence',
      theme: 'Thème',
      accent: 'Couleur d’accent',
      // Pas « vérifiée » : le mot est proscrit partout dans le produit, parce
      // qu'appliqué à un contenu c'est une garantie de qualité. Ici il s'agit du
      // contraste d'une couleur, et « mesurer » est de toute façon plus exact.
      accentHint:
        'Vide garde celle du thème. Nous mesurons le contraste avant d’enregistrer.',
      watermark: 'Filigrane',
      watermarkHint: 'Affiché en petit sur chaque diapositive. En général ton identifiant.',

      rulesHeading: 'Règles',
      requireSources: 'Chaque publication doit montrer ses sources',
      requireSourcesHint:
        'C’est ce qui rend une publication substantiellement transformée au sens de la politique d’originalité d’Instagram. À laisser activé pour tout ce qui est factuel.',
      publicInterest: 'Cela touche à la santé, l’argent, le droit, la sécurité ou la politique',
      publicInterestHint:
        'Relève le niveau qu’une affirmation doit atteindre et active l’étiquette IA par défaut, ce que le règlement européen sur l’IA demande dans ces domaines.',
      requireAdLabel: 'Signaler la publicité quand une publication porte un lien commercial',
      requireAdLabelHint: '§ 5a UWG, pour les opérateurs en Allemagne. Le désactiver est un choix.',
      minConfidence: 'Le degré de certitude exigé',
      minConfidenceHint:
        'Entre 0,5 et 1. Une affirmation clé en dessous retient la publication, et aucune chaîne ne peut descendre plus bas — ce plancher est ce qui garde la vérification utile.',
      forbiddenTopics: 'Ne jamais traiter',
      forbiddenTopicsHint: 'Un par ligne. Refusé pendant que les idées sont encore esquissées.',

      promptHeading: 'Instructions supplémentaires',
      promptIntro:
        'Ajoutées à la fin des instructions d’une étape. Il n’y a volontairement pas de champ pour l’étape de recherche : une chaîne ne doit pas pouvoir lui dicter sa conclusion.',
      promptIdeate: 'Pour chercher des idées',
      promptWrite: 'Pour rédiger les diapositives',

      cadenceHeading: 'À quelle fréquence',
      cadenceNotWiredUp:
        'Enregistré, mais rien n’est encore publié automatiquement. Ces réglages sont conservés pour la publication récurrente à venir — pour l’instant, chaque publication est programmée individuellement à l’approbation.',
      postsPerWeek: 'Publications par semaine',
      preferredTimes: 'Heures préférées',
      preferredTimesHint: 'HH:mm, séparées par des espaces.',
      timezone: 'Fuseau horaire',
      timezoneHint: 'Un nom IANA, comme Europe/Berlin.',

      makeDefault: 'Utiliser cette chaîne par défaut',
      save: 'Enregistrer la chaîne',
      saving: 'Enregistrement…',
      cancel: 'Annuler',
      problems: 'Il y a des choses à corriger avant de pouvoir enregistrer :',
    },

    errors: {
      slugTaken: 'Une autre chaîne de cet espace de travail utilise déjà ce nom court.',
      missing: 'Cette chaîne n’existe plus.',
      describeMore: 'Donne-lui une ou deux phrases sur lesquelles travailler.',
      generateFailed: (detail: string) =>
        `La chaîne n’a pas pu être esquissée : ${detail}. Vérifie qu’un fournisseur de modèle est configuré dans ton .env.`,
      generateUnusable:
        'Ce qui est revenu ne ferait pas une chaîne utilisable. Décris-la un peu autrement, ou part d’une chaîne vide.',
    },
  },

  /**
   * The licence banner. Reports only — no feature is gated on any of this.
   */
  license: {
    expired: (licensee: string, on: string) => `La licence de ${licensee} a expiré le ${on}.`,
    invalid: (reason: string) => `Cette clé de licence n’a pas été acceptée : ${reason}`,
    unverifiable: 'Une clé de licence est définie, mais ce build n’a pas la clé de signature pour la vérifier — c’est notre erreur d’empaquetage, pas la tienne.',
    nothingRestricted: 'Rien n’est restreint. Tout continue de fonctionner exactement comme avant.',
  },

  record: {
    kicker: 'Dossier éditorial',
    backToReview: '← Retour à la relecture',
    downloadJson: 'Télécharger le JSON',
    downloadCsv: 'Télécharger le CSV',
    printHint: 'Imprime cette page pour obtenir un PDF.',
    untitled: 'Publication sans titre',
    summary: 'Résumé',
    postId: 'Identifiant de la publication',
    created: 'Créée',
    approved: 'Approuvée',
    responsibility: 'Qui en a pris la responsabilité',
    notApproved: 'Pas encore approuvée',
    published: 'Publiée',
    igMediaId: 'Identifiant du média Instagram',
    aiDisclosure: 'Mention IA',
    labelled: 'Indiquée comme assistée par IA',
    notLabelled: 'Non indiquée',
    confidenceFloor: 'Certitude exigée',
    confidenceFloorValue: (value: string) => `${value} (défini par la chaîne)`,
    claimsLabel: 'Affirmations',
    claimsValue: (checked: number, core: number, overridden: number) =>
      `${checked} recherchées · ${core} clés · ${overridden} acceptées malgré tout`,
    pagesConsulted: 'Pages ouvertes',
    unresolved: (count: number) =>
      count === 1
        ? 'Une affirmation clé n’a pas atteint la certitude exigée, et personne ne l’a acceptée malgré tout. Cette publication ne pouvait pas être publiée au moment où ce dossier a été produit.'
        : `${count} affirmations clés n’ont pas atteint la certitude exigée, et personne ne les a acceptées malgré tout. Cette publication ne pouvait pas être publiée au moment où ce dossier a été produit.`,
    claimsTitle: (count: number) => `Affirmations et ce qu’ont dit les sources (${count})`,
    noClaims: 'Aucune affirmation n’a été enregistrée pour cette publication.',
    noSources: 'Aucune source enregistrée.',
    core: 'clé',
    overriddenBy: 'Accepté malgré tout',
    overriddenByUnknown: 'une personne qui n’est plus dans cet espace de travail',
    slidesTitle: (count: number) => `Diapos (${count})`,
    nothingWritten:
      'Rien n’a été rédigé — la recherche a arrêté cette publication avant l’étape d’écriture.',
    altText: 'Texte alternatif :',
    editedByHand: 'Modifiée à la main après la recherche :',
    captionTitle: 'Légende',
    reviewNoteTitle: 'Note',
    consultedTitle: (count: number) => `Pages ouvertes (${count})`,
    consultedIntro:
      'Tout ce que l’étape de recherche a ouvert, que cela ait été cité ou non.',
    producedAt: (stamp: string, id: string) =>
      `Produit le ${stamp} à partir du dossier enregistré pour la publication ${id}.`,
    disclaimer:
      'Ce document consigne ce qui a été recherché, ce que les sources ont dit et qui a pris la responsabilité éditoriale. Il ne certifie pas qu’une affirmation soit vraie.',
  },

  members: {
    title: 'Personnes',
    intro:
      'Qui peut utiliser cet espace de travail, et pour quoi faire. Une invitation est un lien que tu envoies toi-même — une installation auto-hébergée n’a pas de serveur mail, rien n’est donc envoyé en ton nom.',
    people: 'Dans cet espace',
    pending: 'Invités, pas encore arrivés',
    invite: 'Inviter quelqu’un',
    email: 'Son e-mail',
    role: 'Rôle',
    createInvite: 'Créer le lien d’invitation',
    creatingInvite: 'Création…',
    inviteReady: 'Invitation prête. Envoie ce lien à la personne invitée.',
    inviteLink: 'Lien d’invitation',
    inviteOnce:
      'Affiché une seule fois. Quiconque détient ce lien rejoint l’espace avec le rôle choisi : traite-le comme un mot de passe. Il expire au bout de sept jours.',
    inviteHint:
      'La personne devra se connecter ou créer un compte avec exactement cette adresse. Mets ALLOW_SIGNUP=true le temps qu’elle le fasse, puis remets-le.',
    expires: (when: string) => `Expire le ${when}`,
    revoke: 'Révoquer',
    revoking: 'Révocation…',
    remove: 'Retirer',
    removing: 'Retrait…',
    you: '(toi)',
    roles: {
      owner: 'Propriétaire — tout, y compris la facturation',
      admin: 'Admin — tout sauf la propriété',
      editor: 'Rédacteur — écrire et modifier, sans approuver',
      viewer: 'Lecteur — lecture seule',
    },
    errors: {
      notPermitted: 'Ton rôle ne permet pas de gérer les personnes.',
      badEmail: 'Cela ne ressemble pas à une adresse e-mail.',
      badRole: 'Ce rôle ne peut pas être attribué.',
      notYourself: 'Tu ne peux pas changer ton propre rôle ni te retirer toi-même.',
      cannotChangeOwner:
        'Le propriétaire de l’espace ne peut être ni modifié ni retiré.',
    },
  },

  invite: {
    title: 'Cette invitation n’a pas pu être utilisée.',
    joinTitle: 'Rejoindre l’espace de travail',
    joinPrompt:
      'Tu es connecté. Rejoins cet espace uniquement si cette invitation t’est destinée.',
    join: 'Rejoindre l’espace',
    joining: 'Connexion…',
    activateFailed:
      'L’espace a été rejoint, mais il n’a pas pu être ouvert. Réessaie.',
    invalid: 'Le lien a expiré, a été révoqué ou a déjà servi. Demande-en un nouveau.',
    alreadyMember: 'Tu fais déjà partie de cet espace : il n’y avait rien à accepter.',
    wrongEmail: (invited: string, current: string) =>
      `Cette invitation était pour ${invited}, et tu es connecté en tant que ${current}. Connecte-toi avec l’adresse invitée, ou demande une invitation pour celle-ci.`,
  },

  noWorkspace: {
    title: 'Tu n’es encore dans aucun espace de travail',
    explain: (email: string) =>
      `Tu es connecté en tant que ${email}, mais tu n’appartiens à aucun espace de travail. Les publications, les chaînes et les comptes Instagram vivent tous dans un espace : tant que tu n’y es pas, il n’y a rien à afficher.`,
    pasteLabel: 'Lien d’invitation',
    pasteHint:
      'Si quelqu’un t’a invité, colle ici le lien complet qu’il t’a envoyé. Un lien cesse de fonctionner sept jours après sa création.',
    pasteAction: 'Ouvrir l’invitation',
    pasteInvalid:
      'Cela ne ressemble pas à un lien d’invitation. Colle le lien complet que tu as reçu, ou demandes-en un nouveau.',
    startTitle: 'Ou crée le tien',
    startHint:
      'Crée un espace vide que toi seul vois. Tu pourras quand même accepter une invitation ensuite et passer de l’un à l’autre.',
    startAction: 'Créer un espace',
    startFailed: 'L’espace de travail n’a pas pu être créé. Réessaie.',
    signOut: 'Se déconnecter',
  },

  workspace: {
    select: 'Changer d’espace de travail',
    failed: 'Impossible de changer d’espace de travail. Réessaie.',
  },

  errors: {
    chooseNiche: 'Choisis d’abord une chaîne.',
    notPermitted: 'Ton rôle dans cet espace de travail ne permet pas de créer des publications.',
    notPermittedTopics:
      'Ton rôle dans cet espace de travail ne permet pas de rechercher des sujets.',
    pageTitle: 'Cette page n’a pas pu se charger.',
    pageBody:
      'La panne vient du serveur et non de ton navigateur : recharger suffit souvent. Si cela continue, le terminal qui fait tourner le tableau de bord en donne la raison.',
    pageRetry: 'Réessayer',
    pageBack: 'Retour au tableau',
    notFoundTitle: 'Cette page n’existe pas.',
    notFoundBody:
      'Le lien est peut-être périmé, ou ce qui se trouvait ici a été supprimé depuis. Ton compte n’a aucun problème.',
    slideCountRange: (max: number) =>
      `Le nombre de diapos doit être un entier compris entre 2 et ${max}.`,
    nicheMissing: 'Cette chaîne n’existe pas.',
    nicheInvalid: (detail: string) =>
      `Cette chaîne ne pourra servir qu’une fois sa configuration corrigée : ${detail}`,
    generateBusy: 'Une publication est déjà en cours de création. Attends la fin.',
    duplicateIdea: 'Cette idée existe déjà, elle n’a donc pas été enregistrée une seconde fois. Essaie un autre sujet, ou laisse le sujet vide pour du nouveau.',
    generateFailed: (detail: string) => `La publication n’a pas pu être créée : ${detail}`,
    discoverBusy: 'Une recherche de sujets est déjà en cours. Attends la fin.',
    discoverFailed: (detail: string) => `La recherche de sujets n’a pas pu aboutir : ${detail}`,
    appIdFormat:
      'L’ID d’application Instagram est le long nombre affiché dans la section Instagram de ton application Meta.',
    appSecretFormat:
      'Cela ne ressemble pas à un secret d’application Instagram. Copie-le depuis la même page que l’ID.',
    instagramDeclined: (detail: string) => `Instagram a refusé la connexion : ${detail}`,
    connectExpired: 'La tentative de connexion a expiré. Réessaie.',
    connectUnverified: 'Nous n’avons pas pu confirmer cette connexion. Recommence.',
    connectNoPending: 'Aucune connexion n’attendait d’être finalisée. Recommence.',
    connectNoPublish:
      'Connecté, mais l’autorisation de publier n’a pas été accordée. Reconnecte-toi et accepte les trois.',
    connectFailed: (detail: string) => `La connexion n’a pas pu être finalisée : ${detail}`,
    connected: (username: string) => `Connecté en tant que @${username}.`,
  },

  appearance: {
    heading: 'Apparence',
    theme: 'Thème',
    themeSystem: 'Comme mon appareil',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    density: 'Hauteur des lignes',
    densityHelp:
      'Ce qui tient à l’écran. Compact en montre plus d’un coup ; aéré se parcourt plus tranquillement.',
    densityCompact: 'Compact',
    densityComfortable: 'Normal',
    densitySpacious: 'Aéré',
    toggleSidebar: 'Réduire le menu',
    expandSidebar: 'Déplier le menu',
    skipToContent: 'Aller au contenu',
    loading: 'Chargement',
    openMenu: 'Ouvrir le menu',
    closeMenu: 'Fermer le menu',
  },

  palette: {
    open: 'Rechercher',
    placeholder: 'Aller à…',
    noResults: 'Rien ne correspond.',
    hint: 'Échap pour fermer',
    goTo: 'Aller à',
    setupTitle: 'Configurer la publication',
  },

  gate: {
    claim_false: (p) =>
      p['scope'] === 'incidental'
        ? `Les sources disent le contraire, et ce n’est pas central — retire-le : «\u00a0${p['claim']}\u00a0»`
        : `Les sources contredisent une affirmation clé : «\u00a0${p['claim']}\u00a0»`,
    claim_unverifiable: (p) =>
      `Aucune source exploitable n’a été trouvée pour une affirmation clé : «\u00a0${p['claim']}\u00a0»`,
    claim_low_confidence: (p) =>
      `Une affirmation clé est moins sûre que ce que cette chaîne autorise (${p['confidence']}, exigé ${p['floor']}) : «\u00a0${p['claim']}\u00a0»`,
    claim_unsourced: (p) => `Une affirmation clé n’a aucune source à citer : «\u00a0${p['claim']}\u00a0»`,
    claim_disputed: (p) =>
      `Les sources divergent, cela doit être présenté comme contesté : «\u00a0${p['claim']}\u00a0»`,
    claim_resolved_by_human: (p) =>
      `Quelqu’un l’a accepté malgré tout, bien que les sources disent «\u00a0${p['verdict']}\u00a0» : «\u00a0${p['claim']}\u00a0»`,
    not_verified: () => 'Rien dans cette publication n’a encore été recherché dans des sources.',
    caption_too_long: (p) =>
      `La légende fait ${p['length']} caractères. Instagram en autorise ${p['max']}.`,
    too_many_hashtags: (p) => `${p['count']} hashtags. Instagram en autorise ${p['max']}.`,
    missing_alt_text: (p) => `La diapo ${p['slide']} n’a pas de texte alternatif.`,
    slide_count: (p) => `${p['count']} diapos. Un carrousel en demande entre 2 et 10.`,
    plan_mismatch: (p) =>
      `La publication a ${p['actual']} diapos alors que la mise en page en attendait ${p['expected']}.`,
    role_mismatch: (p) =>
      `La diapo ${p['slide']} est une diapo «\u00a0${p['actual']}\u00a0» là où la mise en page attendait «\u00a0${p['expected']}\u00a0».`,
    slide_edited_after_check: (p) =>
      `La diapositive ${p['slide']} a été modifiée à la main après la consultation de ses affirmations. Ce que disent les sources ci-dessous a été lu par rapport à la formulation précédente.`,
    hook_not_first: (p) =>
      `La publication commence par une diapositive « ${p['role']} » plutôt que par l’accroche. La première est la seule que la plupart des gens voient.`,
    no_account: () => 'Cette publication n’a aucun compte Instagram vers lequel publier. Choisis-en un sur sa chaîne.',
    account_not_connected: (p) => `Le compte @${p['username']} est « ${p['status']} » et non connecté : la publication échouerait. Reconnecte-le dans les Réglages.`,
    missing_sources_slide: () =>
      'Cette chaîne exige que chaque publication montre ses sources, et il n’y a pas de diapo sources.',
    ad_label_required: () =>
      'Cette publication contient un lien commercial et doit être signalée comme publicité avant parution (§ 5a UWG en Allemagne).',
  },

  runNotes: {
    sourceUnavailable: (p) => `${p['source']} était injoignable : ${p['reason']}`,
    trendingCapped: (p) =>
      `${p['available']} expressions en tendance étaient disponibles ; les ${p['used']} premières ont été consultées, car chacune coûte une requête sur la limite.`,
    seedsCapped: (p) =>
      `Cette chaîne indique ${p['available']} domaines ; les ${p['used']} premiers ont été consultés. Chacun coûte une requête sur la limite.`,
    forbiddenDropped: (p) =>
      `${p['count']} propositions relevaient de sujets que cette chaîne exclut ; elles ont été écartées avant toute mesure.`,
    livingCheckFailed: (p) =>
      `La vérification gratuite « personne vivante » n’a pas pu s’exécuter (${p['reason']}). Ces propositions ont donc été mesurées puis écartées ensuite.`,
    livingDropped: (p) =>
      `${p['count']} propositions ont été écartées avant mesure parce qu’il s’agit de personnes vivantes. Ce contrôle coûte deux requêtes et en économise une par proposition — c’est pourquoi la liste des articles les plus lus ne remplit pas simplement le budget avec les personnes dont on a parlé hier.`,
    budgetCapped: (p) =>
      `${p['gathered']} propositions ont été rassemblées et ${p['measured']} mesurées ; le reste attend une prochaine recherche. Le budget existe parce que la limite de requêtes est volontairement basse — l’augmenter allonge d’autant la recherche.`,
    measureFailed: (p) => `« ${p['title']} » n’a pas pu être mesuré : ${p['reason']}`,
  },

  status: {
    idea: 'Idée',
    drafted: 'Brouillon',
    checked: 'Sources trouvées',
    rendered: 'Images prêtes',
    review: 'À relire',
    approved: 'Approuvé',
    scheduled: 'Programmé',
    publishing: 'Publication en cours',
    published: 'Publié',
    failed: 'Échec',
    rejected: 'Arrêté',
  },
}
