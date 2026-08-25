/**
 * English interface text — and the source every other language is written from.
 *
 * **How the copy here is meant to sound.** The people using this run Instagram
 * channels; they are not engineers, and nothing here should need a second
 * read. So: short sentences, ordinary words, and any term borrowed from Meta
 * or from the law explained the first time it appears. Where a plain word
 * exists, it wins — "connection" over "OAuth flow", "checked against sources"
 * over "verified".
 *
 * One rule is not stylistic. This product must never say a post is
 * "fact-checked", "verified" or "accurate". Under German law those are quality
 * characteristics a seller can be held to (§ 434 BGB, § 5a UWG). What the
 * product actually does is research claims, show the sources, and refuse to
 * publish until a person takes responsibility — so that is what the words say.
 * Translations must hold that line too.
 */

export const en = {
  common: {
    back: 'Back',
    continue: 'Continue',
    cancel: 'Cancel',
    save: 'Save',
    saved: 'Saved',
    dismiss: 'Hide',
    restore: 'Show again',
    open: 'Open',
    finish: 'Finish',
    copy: 'Copy',
    copied: 'Copied',
    copyManualHint:
      'Your browser would not let the page copy this. It is selected — press Ctrl+C (⌘C on a Mac). Browsers only allow copying on https, or on localhost.',
    optional: 'optional',
    none: 'None',
    yes: 'Yes',
    no: 'No',
    loading: 'Working…',
  },

  nav: {
    board: 'Board',
    topics: 'Topics',
    generate: 'Create',
    niches: 'Channels',
    members: 'People',
    settings: 'Settings',
    backToBoard: '← Back to board',
    landmark: 'Main',
  },

  signIn: {
    title: 'Sign in',
    subtitle: 'Sign in to your workspace.',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    noAccount: 'No account yet?',
    createOne: 'Create one',
    signingIn: 'Signing in…',
    name: 'Your name',
    signUpSubtitle: 'Set up your workspace.',
    invitedSignUpSubtitle: 'Create your account to join the invited workspace.',
    passwordHint: 'At least 12 characters.',
    createAccount: 'Create account',
    haveAccount: 'Already have an account? Sign in',
    workspaceNameTemplate: '{owner}’s workspace',
  },

  board: {
    title: 'Board',
    createPost: 'Create a post',
    columns: {
      review: 'Needs your review',
      approved: 'Approved',
      scheduled: 'Scheduled',
      published: 'Published',
      closed: 'Stopped',
    },
    unresolved: (count: number) => (count === 1 ? '1 to check' : `${count} to check`),
    slideCount: (count: number) => (count === 1 ? '1 slide' : `${count} slides`),
    capped: (count: number) =>
      `Showing the ${count} most recently changed. The column numbers count everything.`,
    empty: {
      title: 'No posts yet.',
      body: 'Create one and watch it work: an idea is drafted, every fact in it is looked up against real sources, and only then is anything written.',
      createFirst: 'Create your first post',
      setUpPublishing: 'Set up publishing',
      notConnected:
        'No Instagram account is connected yet, so you can create and review a post but not publish it. Connecting takes about ten minutes.',
    },
  },

  generate: {
    title: 'Create a post',
    intro:
      'Four ideas are drafted, the best one is picked, and every fact in it is looked up against real sources. That check happens before anything is written — so an idea that will not hold up never costs you a finished post.',
    niche: 'Channel',
    nicheHelp:
      'The channel sets the language, the tone, the slide layouts, and how sure a fact has to be before it can be used.',
    topic: 'Topic',
    topicPlaceholder: 'Leave empty and a subject will be picked for you',
    topicFromDiscovery:
      'Filled in from a topic we found for you. Change it freely — this is a starting point, not the headline.',
    slides: 'Number of slides',
    slidesPlaceholder: 'Let the layout decide',
    slidesHelp: (max: number) =>
      `Instagram allows up to ${max} slides. Each layout works best in its own range.`,
    submit: 'Create',
    working: 'Creating…',
    cost:
      'This takes about a minute and costs roughly $0.40. Keep this tab open.',
    stages: [
      'Coming up with ideas',
      'Looking up every fact against real sources',
      'Deciding whether it holds up',
      'Writing the slides',
    ],
    gateNote:
      'If the facts do not hold up, nothing gets written. You will land on a stopped post that shows you exactly which claim failed and what was searched.',
    noNiche: {
      title: 'No channel set up yet.',
      body: 'A channel holds the language, the tone, the slide layouts and your rules.',
      seedHint: (command: string) => `Run ${command} to add the example one.`,
    },
    problems: 'Some channels cannot be used yet:',
    misconfigured: 'needs fixing',
    formats: (count: number) => (count === 1 ? '1 layout' : `${count} layouts`),
    recentRuns: 'Recent',
    spend: (runs: number, usd: string) =>
      `${runs} post${runs === 1 ? '' : 's'} created in the last 30 days, costing about $${usd} in model calls.`,
    alreadyRunning: 'A post is being created right now.',
    alreadyRunningSince: (at: Date, locale: string) =>
      `Started ${at.toLocaleTimeString(locale)}. It keeps running even if you leave this page — when it finishes, the new post appears under Recent below and on the board.`,
    language: (language: string) => `Will be written in ${language}`,
  },

  topics: {
    title: 'Topics',
    intro: (durabilityPercent: number) =>
      `Subjects worth writing about, found in free public sources: Wikipedia's own view counts, published trending lists and open news indexes. They are ranked by whether they will still be worth reading next year — that is ${durabilityPercent}% of the score. Being in the news today can lift a good subject, but it can never rescue a weak one.`,
    niche: 'Channel',
    discover: 'Find topics',
    colTopic: 'Subject',
    colViews: 'Views / month',
    colLinks: 'Sources',
    colScore: 'Score',
    colWhy: 'Why',
    colActions: 'Actions',
    working: 'Looking…',
    waitTitle: 'This takes a few minutes and costs nothing. Keep this tab open.',
    waitBody:
      'Every source here is free, and we deliberately ask for no more than ten pages a minute — far less than any of them allow. The wait is us being polite, not a queue. Wikipedia’s view data is run by a charity, and tools that hammer it are why open services stop being open.',
    waitCached:
      'Results are saved, so the next run is much faster. Nothing is written and nothing is published here — this step only decides what is worth looking at.',
    aboutLastRun: 'About the last search',
    accepted: 'Worth writing about',
    acceptedEmpty: 'Nothing made it through this time.',
    recommended: 'Recommended for this channel',
    recommendedEmpty: 'Nothing is a close channel match this time.',
    explore: 'Explore beyond your channel',
    exploreEmpty: 'No broader ideas this time.',
    exploreNote:
      'These subjects passed the safety checks but do not yet share your channel vocabulary. They are ideas to explore, not recommendations.',
    rejected: 'Set aside',
    rejectedEmpty: 'Nothing was set aside.',
    rejectedNote:
      'Kept, with the reason. A subject dropped for one borderline reason is exactly the kind you might disagree with — so you can see it and decide for yourself.',
    dismissed: 'Hidden',
    dismissedEmpty: 'Nothing hidden.',
    showDismissed: 'Show hidden topics',
    empty:
      'Nothing found for this channel yet. The first search takes a few minutes, because we stay well inside what the free sources allow.',
    noNiche: {
      title: 'No channel set up yet.',
      body: 'Topics are scored against a channel’s language and subject areas, so you need one first.',
    },
    viewsPerMonth: (views: string) => `${views} views a month`,
    links: (count: number) => (count === 1 ? '1 source link' : `${count} source links`),
    linksHelp: (floor: number) =>
      `Links out of the Wikipedia article. We skip anything with fewer than ${floor}, because thin articles rarely give us enough to work from.`,
    trending: 'in the news',
    alreadyUsed: 'Already used',
    generate: 'Create a post',
    article: 'Read the article',
    scoreHelp: 'Overall score. The scale runs to 1.30 once today’s attention is counted.',
    breakdown: (parts: {
      lasting: string
      interest: string
      sources: string
      fit: string
    }) =>
      `Lasting interest ${parts.lasting} · people looking ${parts.interest} · sources to work from ${parts.sources} · fits your channel ${parts.fit}`,
    recencyBoost: (multiplier: string) => `boosted ×${multiplier} for being in the news`,
    reasons: {
      'too-few-references': 'not enough sources',
      'disputed-or-outdated': 'Wikipedia editors flagged it',
      'living-person': 'a living person',
      ymyl: 'health, money or law',
      'too-new': 'article is very new',
      'single-recent-spike': 'a one-off news story',
      'no-article': 'no article found',
    } as Record<string, string>,
  },

  niches: {
    title: 'Channels',
    intro:
      'A channel is your whole setup: the language, who you are writing for, how it should sound, which slide layouts you use and what your rules are. Change any of it without touching code.',
    language: 'Language',
    audience: 'Written for',
    voice: 'Tone',
    formats: 'Slide layouts',
    seeds: 'Subject areas',
    rules: 'Rules',
    minConfidence: 'How sure a fact must be',
    requireSources: 'Every post must show its sources',
    publicInterest: 'Label posts as AI-assisted',
    forbidden: 'Never write about',
    cadence: 'How often to post',
    postsPerWeek: (count: number) => (count === 1 ? '1 post a week' : `${count} posts a week`),
    default: 'Default',
    theme: 'Look',
    invalid: (detail: string) =>
      `This channel's setup is not valid, so it cannot be used yet: ${detail}`,
    neverCovers: 'Never covers:',
    empty: {
      title: 'No channels yet.',
      body: (command: string) => `Run ${command} to add the example channel.`,
    },
    footer: 'Channels start from the examples in the code and live in the database once installed.',
    footerLink: 'Create a post with one',
  },

  settings: {
    title: 'Settings',

    /** Your own account. Everything else on this page belongs to the workspace. */
    account: {
      heading: 'Your account',
      name: 'Your name',
      nameHint: 'Shown on the posts you approve, in the editorial record.',
      email: 'Email',
      emailHint: 'What you sign in with.',
      saveProfile: 'Save',
      saving: 'Saving…',
      profileSaved: 'Saved.',

      passwordHeading: 'Change password',
      currentPassword: 'Current password',
      currentPasswordHint: 'Asked for because a session left open on a shared machine should not be enough to lock you out of your own account.',
      newPassword: 'New password',
      newPasswordHint: 'At least 12 characters.',
      confirmPassword: 'New password again',
      changePassword: 'Change password',
      passwordChanged: 'Password changed. Your other sessions have been signed out.',
      signOutOthers: 'Sign out everywhere else',
      signOutOthersHint: 'Ends every session except this one.',

      errors: {
        nameEmpty: 'Give a name — it is what the editorial record shows against posts you approve.',
        emailInvalid: 'That does not look like an email address.',
        emailTaken: 'Another account here already uses that address.',
        wrongPassword: 'That is not your current password.',
        tooShort: (min: number) => `A password needs at least ${min} characters.`,
        mismatch: 'The two new passwords are not the same.',
        sameAsOld: 'That is the password you already have.',
        failed: 'That could not be saved. Try again.',
      },
    },

    language: {
      heading: 'Language',
      interface: 'Dashboard language',
      interfaceHelp:
        'What you see here: buttons, labels and help text. It does not change posts you have already made.',
      output: 'Language for new channels',
      outputHelp:
        'New channels start in this language. Channels you already have keep their own — that is how one account can run a German channel and an English one at the same time.',
      followInterface: 'Same as the dashboard',
      saved: 'Language saved.',
    },
    readiness: {
      usedByChannels: (names: string) =>
        `Publishing for: ${names}. If this account is ever disconnected or its data deleted, those channels stop being publishable until another account is chosen for them.`,
      heading: 'Before you can publish',
      guidedSetup: 'Walk me through it →',
      appUrl: 'Public address for Meta redirects',
      images: 'Instagram can reach your slide images',
      imagesNotSet: 'Not set up yet',
      account: 'Instagram account connected',
      accountNone: 'Not connected yet',
      token: 'Connection is active',
      tokenNone: 'Not connected yet',
      tokenDays: (days: number) =>
        `Renews automatically. ${days} days left on the current one.`,
      imagesWarning:
        'Instagram loads your slide images from its own servers, so they have to sit on a public web address. A local address works here in the dashboard and then fails the moment you publish.',
    },
    connect: {
      headingNew: 'Connect Instagram',
      headingExisting: 'Reconnect Instagram',
      intro:
        'Claimfold uses your own Meta app rather than ours. That is what keeps you off Meta’s review process — no application, no business verification, no waiting. Create an app at {link}, add Instagram to it, and add your own Instagram account to it as a user.',
      stepByStep: 'Walk me through it instead',
      redirectLabel: 'Return address to add to your Meta app',
      appId: 'Instagram app ID',
      appSecret: 'Instagram app secret',
      secretNote: 'Encrypted before it is saved, and never shown again.',
      submitNew: 'Connect Instagram',
      submitExisting: 'Reconnect',
    },
  },

  setup: {
    stepDone: 'completed',
    title: 'Set up publishing',
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    notChecked: 'We cannot check this from here.',
    doneContinue: 'Done — continue',
    skipForNow: 'Skip for now',
    steps: {
      account: { short: 'Account', title: 'A professional account' },
      metaApp: { short: 'Meta app', title: 'Your own Meta app' },
      redirect: { short: 'Return address', title: 'Add the return address' },
      connect: { short: 'Connect', title: 'Connect your account' },
      ready: { short: 'Ready', title: 'Ready to publish' },
    },
    account: {
      body: 'Instagram only lets apps publish to a professional account — Business or Creator. A personal account is refused, and you find out at the moment you try to publish, so it is worth doing first.',
      how: 'You change this in the Instagram app itself, in your account settings. It is free and you can change back.',
      unverifiable:
        'We cannot see your account type until you are connected. If this step is missed, it shows up at step 4 as a failed connection rather than a warning now.',
    },
    metaApp: {
      body: 'Claimfold talks to Instagram as your app, not ours. Create one at {link}, add Instagram to it, and pick the Instagram login option rather than the Facebook one — that way you do not need a Facebook Page.',
      roleHolder:
        'Then add your own Instagram account to the app as a user. This is the step that saves you weeks: an app that only touches accounts attached to it does not need Meta’s review. If everyone shared one app instead, Meta would require a full review before your first post.',
      reference: 'Meta’s documentation:',
      unverifiable: 'What is inside your Meta app is not something this install can see.',
    },
    redirect: {
      alsoRequired:
        'Meta also insists on these two before it will let you save the app. They are real endpoints on this install: the first is how Instagram tells you when someone disconnects their account, the second is how a person asks for their data to be removed.',
      deauthorizeLabel: 'Deauthorize callback URL',
      dataDeletionLabel: 'Data deletion request URL',
      body: 'Add this web address to your Meta app as a redirect URI — the address Instagram sends you back to after you approve the connection. Meta compares it letter for letter, so a missing slash or http instead of https is enough to break it, and the error message will not tell you that. Copy it rather than typing it.',
      localWarning:
        'This points at your own computer, which is fine while you set things up. To actually publish you need a public web address — when you have one, set APP_URL and add the new address to your Meta app as well. Meta matches exactly, so it is a second entry, not a replacement.',
      unverifiable: 'Whether Meta has this saved is only knowable by trying, which is the next step.',
    },
    connect: {
      connected: (username: string) =>
        `Connected as @${username}. Connecting again replaces it — useful if the connection stopped working or you are switching accounts.`,
      body: 'Paste the two values, then approve the connection. You will be sent to Instagram, asked to allow three things, and brought straight back.',
      warningTitle: 'Not the App ID at the top of the page',
      warningBody:
        'Instagram login uses the Instagram app ID and secret, which belong to the Instagram section inside your Meta app — not the Meta App ID shown in the page header. Both are long numbers, so pasting the wrong one fails with a message that names neither. If the connection fails and the error is vague, check this first.',
      warningRelabel:
        'Meta renames things on this dashboard often, so look for the Instagram section’s own setup page — the same one that asks for the return address — rather than a menu with a particular name.',
    },
    ready: {
      allGood:
        'Everything you need is in place. Nothing publishes on its own — a post still has to hold up and be approved by you.',
      canary:
        'Before scheduling a real post, publish one approved test carousel to a test account and inspect it on Instagram. The live-canary checklist in the documentation records what to check.',
      blocked:
        'You cannot publish until every line above is green. Scheduling a post before then means it fails at the moment it was supposed to go out, when nobody is watching.',
    },
  },

  review: {
    scheduledFor: (when: string) => `Scheduled for ${when}.`,
    scheduledSoon: 'Scheduled to go out as soon as the worker picks it up.',
    rescheduleTo: 'Move to',
    reschedule: 'Move',
    rescheduling: 'Moving…',
    unschedule: 'Take off the schedule',
    unscheduling: 'Taking it off…',
    unscheduleHint: 'Taking it off returns the post to review. Nothing is deleted.',
    title: 'Review',
    record: 'Sources & decisions',
    reject: 'Stop this post',
    approve: 'Approve',
    approveNow: 'Approve & publish now',
    approveScheduled: 'Approve & schedule',
    approveBlocked: 'Sort out the issues below first',
    rejectReason: 'Why (optional)',
    rejectReasonPlaceholder: 'Recorded in the editorial record',
    viewOnInstagram: 'View on Instagram',
    performance: 'How it did',
    metricSaved: 'Saves',
    metricShares: 'Shares',
    metricReach: 'Reach',
    metricComments: 'Comments',
    metricLikes: 'Likes',
    metricFollows: 'New follows',
    metricAsOf: 'Measured',
    reviewNote: 'Note',
    loadingTitle: 'Loading post…',
    publishProblem: 'Publishing problem',
    attemptCount: (n: number) => `${n} attempts`,
    slides: 'Slides',
    noSlides:
      'Nothing was written. The check stopped this post before the writing stage, so there are no slides — the reasons are above, and every source it opened is in the record.',
    noSlidesAction: 'Open the record',
    noClaims: 'No claims were recorded, so there is nothing here to approve on.',
    caption: 'Caption',
    captionCount: (used: number, max: number) => `${used} of ${max} characters`,
    noAltText: 'no alt text',
    evidence: (count: number) =>
      count === 1 ? 'What it is based on · 1 claim' : `What it is based on · ${count} claims`,
    core: 'key claim',
    ready: 'Ready to publish',
    blocked: (count: number) =>
      count === 1 ? 'Blocked — 1 thing to sort out' : `Blocked — ${count} things to sort out`,
    allGood: 'Every key claim has sources and is above the certainty you set.',
    overridden: 'A reviewer accepted this anyway',
    overridePlaceholder: 'Why is this acceptable anyway?',
    override: 'Accept anyway',
    publishAt: 'Publish at',
    publishAtHint: 'Leave empty to publish as soon as possible.',
    approving: 'Approving…',
    rejecting: 'Stopping…',
    overriding: 'Saving…',
    publishesTo: 'Publishes to',
    publishesToNone: 'No account — this cannot be published',
    changeAccount: 'Change',
    accountFromChannel: 'Taken from the channel. Changing it here affects only this post.',
    unusableLink: 'link cannot be opened',

    /**
     * Editor labels.
     *
     * Plain strings only, no functions: this object is handed to a client
     * component, and a function cannot cross that boundary. Anything needing a
     * number goes in `editErrors` below, which is only ever read on the server.
     */
    edit: {
      open: 'Edit',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      tabText: 'Text',
      tabLook: 'Look',
      altText: 'Alt text',
      altTextHint:
        'Describes the slide for people using a screen reader, and Instagram indexes it. Needed before you can approve.',
      headline: 'Headline',
      body: 'Body',
      kicker: 'Kicker',
      footnote: 'Footnote',
      figure: 'Number',
      figureBadge: 'Position badge',
      figureDate: 'Date',
      figureLabel: 'What the number measures',
      items: 'Lines',
      panelTop: 'Top panel',
      panelBottom: 'Bottom panel',
      addLine: 'Add a line',
      removeLine: 'Remove this line',
      layout: 'Layout',
      layoutInherit: 'Same as the rest of the post',
      layoutFixed:
        'The opening, sources and closing slides look the same whichever layout you pick, so a carousel reads as one set.',
      layouts: {
        editorial: 'Editorial',
        split: 'Two panels',
        list: 'Numbered',
        timeline: 'Timeline',
        figure: 'Big number',
        photo: 'Photo',
      } as Record<string, string>,
      picture: 'Picture',
      pictureNone: 'No picture',
      /*
        A `{n}` placeholder, NOT a function.

        This whole `edit` object is handed to `SlideEditor`, which is a client
        component — and a function cannot cross the server/client boundary.
        Adding `pictureOption: (n) => ...` broke every post page with
        "Functions cannot be passed directly to Client Components", which React
        reports at request time rather than at compile time.

        Every interpolating label reachable from a client component has to be a
        placeholder string substituted there, or a value the server resolves
        before passing it down. See the note at the top of sign-in-form.tsx.
      */
      pictureOption: 'Picture {n}',
      pictureUpload: 'Upload a picture',
      pictureUploading: 'Uploading…',
      pictureRecent: 'Already uploaded',
      pictureRemove: 'Take the picture off',
      pictureHint:
        'Text never sits directly on a photo — it sits on a wash of the theme colour, so it stays readable whatever the picture is doing.',
      moveUp: 'Move earlier',
      moveDown: 'Move later',
      remove: 'Delete this slide',
      add: 'Add a slide',
      addHere: 'Add a slide here',
      addRole: 'Kind of slide',
      appearance: 'How every slide looks',
      theme: 'Theme',
      accent: 'Accent colour',
      accentHint: 'Empty keeps the theme’s own.',
      watermark: 'Watermark',
      watermarkHint: 'Shown small on every slide. Usually your handle.',
      apply: 'Apply',
      applying: 'Applying…',
      editedByHand: 'edited by hand',
      caption: 'Caption',
      hashtags: 'Hashtags',
      hashtagsHint: 'Separated by spaces or commas. Three to five relevant ones beat thirty.',
      firstComment: 'First comment',
      firstCommentHint: 'Posted as its own comment straight after publishing. A good place for the sources, so they do not eat the first line of the caption.',
      hook: 'Hook line',
      hookHint: 'Stored separately so you can see which openings earn saves.',
    },

    /** Refusals from the editor. Server-side only, so these may take numbers. */
    editErrors: {
      alreadyPublishing:
        'This post is already being published, so it cannot be changed now. Wait for it to finish.',
      badSchedule: 'That is not a valid date and time.',
      overrideTooShort:
        'Give a reason of at least 10 characters. This is recorded against you in the audit trail, so it has to say something.',
      stale:
        'Someone changed this slide while you had it open. Nothing was saved — reload and try again.',
      missing: 'That slide is no longer part of this post.',
      notEditable:
        'A post that is scheduled or already out cannot be edited. Stop it first if you need to change it.',
      notPermitted:
        'Your role in this workspace does not allow that. An owner or admin can change it in the member list.',
      shapeChanged:
        'The carousel changed while you were looking at it. Nothing was saved — reload and try again.',
      tooFew: 'A carousel needs at least two slides, so this one cannot go.',
      tooMany: (max: number) => `Instagram allows at most ${max} slides.`,
      badField: 'The form held a field this layout does not use, so nothing was saved.',
      accentNotAColour: 'Give the colour as a hex value, like #B4472B.',
      accentUnreadable: (ratio: string, floor: string) =>
        `That colour only reaches ${ratio}:1 against this theme, and text needs ${floor}:1 to stay readable at arm’s length.`,
      uploadTooLarge: (mb: number) => `That picture is over ${mb}MB.`,
      uploadNotAnImage: 'That file could not be read as an image.',
      uploadMissing: 'No picture was attached.',
      noRole: 'Choose what kind of slide to add.',
    },

    verdicts: {
      supported: 'sources agree',
      disputed: 'sources disagree',
      false: 'sources contradict it',
      unverifiable: 'no good source found',
    } as Record<string, string>,
  },

  /**
   * Creating and editing a channel.
   *
   * `form` holds plain strings only, because it is handed to a client component.
   * Anything taking a value lives in `errors` or beside it, which is only read on
   * the server.
   */
  channels: {
    create: 'New channel',
    createTitle: 'New channel',
    editTitle: 'Edit channel',
    edit: 'Edit',
    duplicate: 'Duplicate',
    archive: 'Retire',
    restore: 'Bring it back',
    archivedHeading: 'Retired',
    archivedNote:
      'Retired channels are hidden from the board and cannot make new posts. Nothing is deleted — the posts they produced keep their record.',
    saved: 'Channel saved.',
    generatedBanner:
      'Drafted from your description. Read it through before you use it: the certainty bar and the subjects it refuses to touch are both set here.',
    copyOf: (name: string) => `${name} (copy)`,

    generator: {
      heading: 'Describe a channel in a sentence',
      hint: 'What is it about, who is it for, and roughly how should it sound? Two sentences is plenty.',
      placeholder: 'German-language posts about common misconceptions in history, for curious adults who like being surprised.',
      language: 'Write it in',
      submit: 'Draft a channel',
      working: 'Drafting…',
      cost:
        'One short model call, a few cents. You land on the editor and nothing is used until you save it.',
    },

    form: {
      identityHeading: 'Identity',
      name: 'Name',
      slug: 'Short name',
      slugHint: 'Lowercase letters, digits and hyphens. Used in links, never shown to a reader.',
      description: 'Description',
      descriptionHint: 'A note to yourself. Not sent to the model.',
      language: 'Output language',
      languageHint:
        'A BCP-47 tag: de, en, pt-BR. Decides the language posts are written in, and also hyphenation, dates and numbers.',

      voiceHeading: 'Voice',
      audience: 'Written for',
      audienceHint:
        'Goes into every prompt word for word, so write it as direction rather than marketing. “Beginners who own the tools and keep hitting the same three problems” is useful; “everyone interested in DIY” is not.',
      voice: 'How it should sound',
      voiceHint: 'Also goes in word for word, at the writing stage.',

      whatHeading: 'What it makes',
      topicSeeds: 'Subject areas',
      topicSeedsHint:
        'One per line. Areas that could each carry several posts, not titles for single posts.',
      formats: 'Slide layouts',
      formatsHint:
        'At least one. A layout describes the shape of an argument — a claim and its evidence, an ordered list, a before and after — so any subject fits any of them.',
      hashtagSets: 'Hashtag sets',
      hashtagSetsHint:
        'One set per line, separated by spaces. Since hashtag following ended these are search metadata, so three to five relevant ones beat thirty.',

      account: 'Publishes to',
      accountHint: 'Which connected Instagram account this channel posts to. Chosen here rather than per post, so the watermark and the account can never name different handles.',
      accountNone: 'No account chosen',
      accountNoneAvailable: 'No Instagram account is connected yet. Connect one in Settings, then come back and choose it here.',
      lookHeading: 'Look',
      theme: 'Theme',
      accent: 'Accent colour',
      accentHint: 'Empty keeps the theme’s own. Checked for readability before it saves.',
      watermark: 'Watermark',
      watermarkHint: 'Shown small on every slide. Usually your handle.',

      rulesHeading: 'Rules',
      requireSources: 'Every post must show its sources',
      requireSourcesHint:
        'What makes a post materially transformed under Instagram’s originality policy. Worth leaving on for anything factual.',
      publicInterest: 'This covers health, money, law, safety or politics',
      publicInterestHint:
        'Raises the bar a claim has to clear and turns on the AI label by default, which is what the EU AI Act asks for in these subjects.',
      requireAdLabel: 'Label advertising when a post carries a commercial link',
      requireAdLabelHint: '§ 5a UWG, for operators in Germany. Leaving it off is a choice.',
      minConfidence: 'How sure a claim has to be',
      minConfidenceHint:
        'Between 0.5 and 1. A key claim below this stops the post going out, and no channel can set it lower — that floor is what keeps the check meaningful.',
      forbiddenTopics: 'Never write about',
      forbiddenTopicsHint: 'One per line. Refused while ideas are still being drafted.',

      promptHeading: 'Extra instructions',
      promptIntro:
        'Added to the end of a stage’s instructions. There is deliberately no slot for the research stage: a channel must not be able to tell it what to conclude.',
      promptIdeate: 'When coming up with ideas',
      promptWrite: 'When writing the slides',

      cadenceHeading: 'How often',
      cadenceNotWiredUp:
        'Saved, but nothing posts on a schedule yet. These settings are recorded for when recurring posting is built — for now every post is scheduled individually when you approve it.',
      postsPerWeek: 'Posts per week',
      preferredTimes: 'Preferred times',
      preferredTimesHint: 'HH:mm, separated by spaces.',
      timezone: 'Time zone',
      timezoneHint: 'An IANA name, like Europe/Berlin.',

      makeDefault: 'Use this channel by default',
      save: 'Save channel',
      saving: 'Saving…',
      cancel: 'Cancel',
      problems: 'Some of this needs fixing before it can be saved:',
    },

    errors: {
      slugTaken: 'Another channel in this workspace already uses that short name.',
      missing: 'That channel no longer exists.',
      describeMore: 'Give it a sentence or two to work from.',
      generateFailed: (detail: string) =>
        `The channel could not be drafted: ${detail}. Check that a model provider is configured in your .env.`,
      generateUnusable:
        'What came back would not make a usable channel. Try describing it slightly differently, or start from a blank one.',
    },
  },

  /**
   * The licence banner. Reports only — no feature is gated on any of this.
   */
  license: {
    expired: (licensee: string, on: string) => `The licence for ${licensee} ran out on ${on}.`,
    invalid: (reason: string) => `This licence key could not be accepted: ${reason}`,
    unverifiable: 'A licence key is set, but this build has no signing key to check it against — that is our packaging mistake, not yours.',
    nothingRestricted: 'Nothing is restricted. Everything keeps working exactly as before.',
  },

  record: {
    kicker: 'Editorial record',
    backToReview: '← Back to review',
    downloadJson: 'Download JSON',
    downloadCsv: 'Download CSV',
    printHint: 'Print this page to get a PDF.',
    untitled: 'Untitled post',
    summary: 'Summary',
    postId: 'Post id',
    created: 'Created',
    approved: 'Approved',
    responsibility: 'Who took responsibility',
    notApproved: 'Not approved yet',
    published: 'Published',
    igMediaId: 'Instagram media id',
    aiDisclosure: 'AI label',
    labelled: 'Labelled as AI-assisted',
    notLabelled: 'Not labelled',
    confidenceFloor: 'Certainty required',
    confidenceFloorValue: (value: string) => `${value} (set by the channel)`,
    claimsLabel: 'Claims',
    claimsValue: (checked: number, core: number, overridden: number) =>
      `${checked} looked up · ${core} key · ${overridden} accepted anyway`,
    pagesConsulted: 'Pages opened',
    unresolved: (count: number) =>
      count === 1
        ? 'One key claim did not reach the certainty you set, and nobody accepted it anyway. This post could not be published when this record was made.'
        : `${count} key claims did not reach the certainty you set, and nobody accepted them anyway. This post could not be published when this record was made.`,
    claimsTitle: (count: number) => `Claims and what the sources said (${count})`,
    noClaims: 'No claims were recorded for this post.',
    noSources: 'No sources recorded.',
    core: 'key',
    overriddenBy: 'Accepted anyway',
    overriddenByUnknown: 'a reviewer no longer in this workspace',
    slidesTitle: (count: number) => `Slides (${count})`,
    nothingWritten:
      'Nothing was written — the check stopped this post before the writing stage.',
    altText: 'Alt text:',
    editedByHand: 'Edited by hand after the research:',
    captionTitle: 'Caption',
    reviewNoteTitle: 'Note',
    consultedTitle: (count: number) => `Pages opened (${count})`,
    consultedIntro: 'Everything the research stage opened, whether or not it was cited.',
    producedAt: (stamp: string, id: string) =>
      `Produced ${stamp} from the stored record for post ${id}.`,
    disclaimer:
      'This document records what was researched, what the sources said, and who took editorial responsibility. It does not certify that any statement is true.',
  },

  members: {
    title: 'People',
    intro:
      'Who can use this workspace, and what they may do. An invitation is a link you send yourself — a self-hosted install has no mail server, so nothing is emailed on your behalf.',
    people: 'In this workspace',
    pending: 'Invited, not yet joined',
    invite: 'Invite someone',
    email: 'Their email',
    role: 'Role',
    createInvite: 'Create invite link',
    creatingInvite: 'Creating…',
    inviteReady: 'Invitation ready. Send this link to the person you invited.',
    inviteLink: 'Invitation link',
    inviteOnce:
      'Shown once. Anyone holding this link can join at the role you chose, so send it the way you would send a password. It stops working in seven days.',
    inviteHint:
      'They will need to sign in or create an account with exactly this address. Set ALLOW_SIGNUP=true while they do, then unset it.',
    expires: (when: string) => `Expires ${when}`,
    revoke: 'Revoke',
    revoking: 'Revoking…',
    remove: 'Remove',
    removing: 'Removing…',
    you: '(you)',
    roles: {
      owner: 'Owner — everything, including billing',
      admin: 'Admin — everything except ownership',
      editor: 'Editor — write and edit, cannot approve',
      viewer: 'Viewer — read only',
    } as Record<string, string>,
    errors: {
      notPermitted: 'Your role in this workspace does not allow managing people.',
      badEmail: 'That does not look like an email address.',
      badRole: 'That is not a role you can assign.',
      notYourself: 'You cannot change your own role or remove yourself.',
      cannotChangeOwner: 'The workspace owner cannot be changed or removed.',
    },
  },

  invite: {
    title: 'This invitation could not be used.',
    joinTitle: 'Join workspace',
    joinPrompt: 'You are signed in. Join the workspace only if this invitation is meant for you.',
    join: 'Join workspace',
    joining: 'Joining…',
    activateFailed: 'The workspace was joined, but could not be opened. Try again.',
    invalid:
      'The link has expired, been revoked, or was already used. Ask whoever invited you for a new one.',
    alreadyMember: 'You are already in this workspace, so there was nothing to accept.',
    wrongEmail: (invited: string, current: string) =>
      `This invitation was for ${invited}, and you are signed in as ${current}. Sign in with the invited address, or ask for an invitation to this one.`,
  },

  /**
   * The screen for an account that belongs nowhere.
   *
   * Reached most often by an invitee whose sign-up worked and whose invitation
   * then did not — so the copy leads with the invitation link rather than with
   * "start your own", which is the right answer far less often and the more
   * tempting button.
   */
  noWorkspace: {
    title: 'You are not in a workspace yet',
    explain: (email: string) =>
      `You are signed in as ${email}, but you do not belong to a workspace. Posts, channels and Instagram accounts all live inside one, so there is nothing to show you until you are in it.`,
    pasteLabel: 'Invitation link',
    pasteHint:
      'If someone invited you, paste the whole link they sent. A link stops working seven days after it was made.',
    pasteAction: 'Open invitation',
    pasteInvalid:
      'That does not look like an invitation link. Paste the whole link you were sent, or ask whoever invited you for a new one.',
    startTitle: 'Or start your own',
    startHint:
      'Makes an empty workspace only you can see. You can still accept an invitation afterwards and switch between the two.',
    startAction: 'Start a workspace',
    startFailed: 'The workspace could not be created. Try again.',
    signOut: 'Sign out',
  },

  workspace: {
    select: 'Switch workspace',
    failed: 'Could not switch workspace. Try again.',
  },

  errors: {
    chooseNiche: 'Choose a channel first.',
    notPermitted: 'Your role in this workspace does not allow creating posts.',
    notPermittedTopics: 'Your role in this workspace does not allow finding topics.',
    pageTitle: 'This page could not load.',
    pageBody:
      'Something failed on the server rather than in your browser, so reloading may well fix it. If it keeps happening, the terminal running the dashboard prints the reason.',
    pageRetry: 'Try again',
    pageBack: 'Back to the board',
    notFoundTitle: 'This page does not exist.',
    notFoundBody:
      'The link may be out of date, or whatever was here has since been deleted. Nothing is wrong with your account.',
    slideCountRange: (max: number) =>
      `The number of slides has to be a whole number between 2 and ${max}.`,
    nicheMissing: 'That channel does not exist.',
    nicheInvalid: (detail: string) =>
      `This channel cannot be used until its setup is fixed: ${detail}`,
    generateBusy: 'A post is already being created. Wait for it to finish.',
    duplicateIdea: 'That idea has already been made before, so it was not saved again. Try a different topic, or leave the topic empty to get something new.',
    generateFailed: (detail: string) => `Could not create the post: ${detail}`,
    discoverBusy: 'A topic search is already running. Wait for it to finish.',
    discoverFailed: (detail: string) => `The topic search could not finish: ${detail}`,
    appIdFormat:
      'The Instagram app ID should be the long number from the Instagram section of your Meta app.',
    appSecretFormat:
      'That does not look like an Instagram app secret. Copy it from the same page as the app ID.',
    instagramDeclined: (detail: string) => `Instagram refused the connection: ${detail}`,
    connectExpired: 'The connection attempt timed out. Please try again.',
    connectUnverified: 'We could not confirm that connection. Please start again.',
    connectNoPending: 'There was no connection waiting to finish. Please start again.',
    connectNoPublish:
      'Connected, but permission to publish was not granted. Connect again and allow all three.',
    connectFailed: (detail: string) => `Could not finish connecting: ${detail}`,
    connected: (username: string) => `Connected as @${username}.`,
  },

  appearance: {
    heading: 'Appearance',
    theme: 'Theme',
    themeSystem: 'Match my device',
    themeLight: 'Light',
    themeDark: 'Dark',
    density: 'Row height',
    densityHelp:
      'How much fits on screen. Compact shows more at once; spacious is easier to work through slowly.',
    densityCompact: 'Compact',
    densityComfortable: 'Comfortable',
    densitySpacious: 'Spacious',
    toggleSidebar: 'Collapse the menu',
    expandSidebar: 'Expand the menu',
    skipToContent: 'Skip to content',
    loading: 'Loading',
    openMenu: 'Open the menu',
    closeMenu: 'Close the menu',
  },

  palette: {
    open: 'Search',
    placeholder: 'Jump to…',
    noResults: 'Nothing matches that.',
    hint: 'Press Esc to close',
    goTo: 'Go to',
    setupTitle: 'Set up publishing',
  },

  gate: {
    claim_false: (p) =>
      p['scope'] === 'incidental'
        ? `The sources contradict this, and it is not central — take it out: “${p['claim']}”`
        : `The sources contradict a key claim: “${p['claim']}”`,
    claim_unverifiable: (p) => `No usable source was found for a key claim: “${p['claim']}”`,
    claim_low_confidence: (p) =>
      `A key claim is less certain than this channel allows (${p['confidence']}, and you asked for ${p['floor']}): “${p['claim']}”`,
    claim_unsourced: (p) => `A key claim has no source to point at: “${p['claim']}”`,
    claim_disputed: (p) =>
      `The sources disagree, so this has to be written as contested: “${p['claim']}”`,
    claim_resolved_by_human: (p) =>
      `Someone accepted this anyway, despite the sources saying “${p['verdict']}”: “${p['claim']}”`,
    not_verified: () => 'Nothing in this post has been looked up against sources yet.',
    caption_too_long: (p) =>
      `The caption is ${p['length']} characters. Instagram allows ${p['max']}.`,
    too_many_hashtags: (p) => `${p['count']} hashtags. Instagram allows ${p['max']}.`,
    missing_alt_text: (p) => `Slide ${p['slide']} has no alt text.`,
    slide_count: (p) => `${p['count']} slides. A carousel needs between 2 and 10.`,
    plan_mismatch: (p) => `The post has ${p['actual']} slides but the layout expected ${p['expected']}.`,
    role_mismatch: (p) =>
      `Slide ${p['slide']} is a “${p['actual']}” slide where the layout expected “${p['expected']}”.`,
    slide_edited_after_check: (p) =>
      `Slide ${p['slide']} was edited by hand after its claims were looked up. What the sources say below was read against the earlier wording.`,
    hook_not_first: (p) =>
      `The post opens with a “${p['role']}” slide instead of the hook. Slide one is the only slide most people see.`,
    no_account: () => 'This post has no Instagram account to publish to. Choose one on its channel.',
    account_not_connected: (p) => `The account @${p['username']} is “${p['status']}” rather than connected, so publishing would fail. Reconnect it in Settings.`,
    missing_sources_slide: () =>
      'This channel requires every post to show its sources, and there is no sources slide.',
    ad_label_required: () =>
      'This post has a commercial link, so it has to be labelled as advertising before it goes out (§ 5a UWG in Germany).',
  } as Record<string, (params: Record<string, string | number>) => string>,

  /**
   * What a discovery run says about itself.
   *
   * Same shape as `gate` and for the same reason: the run produces a code and
   * its numbers, and the sentence is built here. These are the only place the
   * dashboard explains why a run measured twenty things out of fifty-one, so a
   * reader who does not read English would otherwise be told nothing.
   */
  runNotes: {
    sourceUnavailable: (p) => `${p['source']} could not be reached: ${p['reason']}`,
    trendingCapped: (p) =>
      `${p['available']} trending phrases were available; the first ${p['used']} were looked up, because each one costs a request against the rate limit.`,
    seedsCapped: (p) =>
      `This channel lists ${p['available']} topic areas; the first ${p['used']} were looked up. Each one costs a request against the rate limit.`,
    forbiddenDropped: (p) =>
      `${p['count']} candidates matched the subjects this channel refuses, and were dropped before being measured.`,
    livingCheckFailed: (p) =>
      `The free living-person check could not run (${p['reason']}), so those candidates were measured and turned down afterwards instead.`,
    livingDropped: (p) =>
      `${p['count']} candidates were dropped before measurement because they are living people. That check costs two requests and saves one per candidate, which is why the most-viewed list does not simply fill the budget with whoever was in the news yesterday.`,
    budgetCapped: (p) =>
      `${p['gathered']} candidates were gathered and ${p['measured']} were measured; the rest are left for a later run. The budget exists because the request limit is deliberately low — raise it and the run takes proportionally longer.`,
    measureFailed: (p) => `“${p['title']}” could not be measured: ${p['reason']}`,
  } as Record<string, (params: Record<string, string | number>) => string>,

  status: {
    idea: 'Idea',
    drafted: 'Drafted',
    checked: 'Checked',
    rendered: 'Images ready',
    review: 'Needs review',
    approved: 'Approved',
    scheduled: 'Scheduled',
    publishing: 'Publishing',
    published: 'Published',
    failed: 'Failed',
    rejected: 'Stopped',
  } as Record<string, string>,
}

/**
 * The shape every other language must match.
 *
 * Derived from the English file rather than declared separately, so a key
 * added here and forgotten there is a compile error rather than a blank space
 * in somebody else's interface.
 */
export type Messages = typeof en
