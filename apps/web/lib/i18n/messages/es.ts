import type { Messages } from './en.ts'

/**
 * Spanish interface text.
 *
 * Tuteo throughout, as is normal for creator tools. Written in neutral
 * Spanish rather than a specific region: "publicación" over "post",
 * "ordenador/computadora" avoided entirely.
 *
 * The same wording rule holds: nothing says a post is "verificado",
 * "comprobado" or "exacto". The product investiga, cita y bloquea.
 *
 * Written by a non-native speaker and worth a native review before release.
 */
export const es: Messages = {
  common: {
    back: 'Atrás',
    continue: 'Continuar',
    cancel: 'Cancelar',
    save: 'Guardar',
    saved: 'Guardado',
    dismiss: 'Ocultar',
    restore: 'Mostrar de nuevo',
    open: 'Abrir',
    finish: 'Finalizar',
    copy: 'Copiar',
    copied: 'Copiado',
    copyManualHint:
      'Tu navegador no dejó que la página copiara esto. El texto está seleccionado: pulsa Ctrl+C (⌘C en Mac). Los navegadores solo permiten copiar en https, o en localhost.',
    optional: 'opcional',
    none: 'Ninguno',
    yes: 'Sí',
    no: 'No',
    loading: 'Trabajando…',
  },

  nav: {
    board: 'Tablero',
    topics: 'Temas',
    generate: 'Crear',
    niches: 'Canales',
    members: 'Personas',
    settings: 'Ajustes',
    backToBoard: '← Volver al tablero',
    landmark: 'Navegación principal',
  },

  signIn: {
    title: 'Iniciar sesión',
    subtitle: 'Inicia sesión en tu espacio de trabajo.',
    email: 'Correo electrónico',
    password: 'Contraseña',
    submit: 'Iniciar sesión',
    noAccount: '¿Aún no tienes cuenta?',
    createOne: 'Crear una',
    signingIn: 'Iniciando sesión…',
    name: 'Tu nombre',
    signUpSubtitle: 'Configura tu espacio de trabajo.',
    invitedSignUpSubtitle: 'Crea tu cuenta para unirte al espacio de trabajo al que te invitaron.',
    passwordHint: 'Al menos 12 caracteres.',
    createAccount: 'Crear cuenta',
    haveAccount: '¿Ya tienes cuenta? Inicia sesión',
    workspaceNameTemplate: 'Espacio de trabajo de {owner}',
  },

  board: {
    title: 'Tablero',
    createPost: 'Crear publicación',
    columns: {
      review: 'Te está esperando',
      approved: 'Aprobado',
      scheduled: 'Programado',
      published: 'Publicado',
      closed: 'Detenido',
    },
    unresolved: (count: number) => (count === 1 ? '1 por ver' : `${count} por ver`),
    slideCount: (count: number) => (count === 1 ? '1 diapositiva' : `${count} diapositivas`),
    capped: (count: number) =>
      `Se muestran los ${count} cambiados más recientemente. Los números lo cuentan todo.`,
    empty: {
      title: 'Todavía no hay publicaciones.',
      body: 'Crea una y observa el proceso: se esboza una idea, cada dato que contiene se busca en fuentes reales, y solo entonces se escribe algo.',
      createFirst: 'Crear tu primera publicación',
      setUpPublishing: 'Configurar la publicación',
      notConnected:
        'Aún no hay ninguna cuenta de Instagram conectada, así que puedes crear y revisar una publicación, pero no publicarla. Conectarla lleva unos diez minutos.',
    },
  },

  generate: {
    title: 'Crear publicación',
    intro:
      'Se esbozan cuatro ideas, se elige la mejor, y cada dato que contiene se busca en fuentes reales. Esa búsqueda ocurre antes de escribir nada, así que una idea que no se sostiene nunca te cuesta una publicación terminada.',
    niche: 'Canal',
    nicheHelp:
      'El canal define el idioma, el tono, los diseños de diapositiva y cuánta certeza necesita un dato antes de poder usarse.',
    topic: 'Tema',
    topicPlaceholder: 'Déjalo vacío y se elegirá un tema por ti',
    topicFromDiscovery:
      'Tomado de un tema que encontramos para ti. Cámbialo sin problema: es un punto de partida, no un titular.',
    slides: 'Número de diapositivas',
    slidesPlaceholder: 'Que lo decida el diseño',
    slidesHelp: (max: number) =>
      `Instagram permite hasta ${max} diapositivas. Cada diseño funciona mejor en su propio rango.`,
    submit: 'Crear',
    working: 'Creando…',
    cost: 'Esto tarda alrededor de un minuto y cuesta unos 0,40 $. Deja esta pestaña abierta.',
    stages: [
      'Buscando ideas',
      'Contrastando cada dato con fuentes reales',
      'Decidiendo si se sostiene',
      'Escribiendo las diapositivas',
    ],
    gateNote:
      'Si los datos no se sostienen, no se escribe nada. Acabarás en una publicación detenida que te muestra exactamente qué afirmación falló y qué se buscó.',
    noNiche: {
      title: 'Todavía no hay ningún canal configurado.',
      body: 'Un canal contiene el idioma, el tono, los diseños de diapositiva y tus reglas.',
      seedHint: (command: string) => `Ejecuta ${command} para añadir el de ejemplo.`,
    },
    problems: 'Estos canales todavía no se pueden usar:',
    misconfigured: 'hay que corregirlo',
    formats: (count: number) => (count === 1 ? '1 diseño' : `${count} diseños`),
    recentRuns: 'Reciente',
    spend: (runs: number, usd: string) =>
      `${runs} publicación${runs === 1 ? '' : 'es'} creada${runs === 1 ? '' : 's'} en los últimos 30 días, por unos ${usd} $ en llamadas al modelo.`,
    alreadyRunning: 'Se está creando una publicación ahora mismo.',
    alreadyRunningSince: (at: Date, locale: string) =>
      `Empezó a las ${at.toLocaleTimeString(locale)}. Sigue en marcha aunque salgas de esta página — cuando termine, la nueva publicación aparecerá en «Reciente» abajo y en el tablero.`,
    language: (language: string) => `Se escribirá en ${language}`,
  },

  topics: {
    title: 'Temas',
    intro: (durabilityPercent: number) =>
      `Temas que merecen una publicación, encontrados en fuentes públicas y gratuitas: los propios recuentos de visitas de Wikipedia, listas de tendencias publicadas e índices de noticias abiertos. Se ordenan según si seguirán mereciendo la pena el año que viene: eso es el ${durabilityPercent} % de la puntuación. Estar hoy en las noticias puede impulsar un buen tema, pero nunca rescata uno flojo.`,
    niche: 'Canal',
    discover: 'Buscar temas',
    colTopic: 'Tema',
    colViews: 'Visitas / mes',
    colLinks: 'Fuentes',
    colScore: 'Puntuación',
    colWhy: 'Motivo',
    colActions: 'Acciones',
    working: 'Buscando…',
    waitTitle: 'Esto tarda unos minutos y no cuesta nada. Deja esta pestaña abierta.',
    waitBody:
      'Todas las fuentes de aquí son gratuitas, y pedimos como mucho diez páginas por minuto a propósito, muy por debajo de lo que permiten. La espera es cortesía, no una cola. Los datos de visitas de Wikipedia los mantiene una organización sin ánimo de lucro, y las herramientas que los machacan son la razón por la que los servicios abiertos acaban cerrando.',
    waitCached:
      'Los resultados se guardan, así que la siguiente búsqueda es mucho más rápida. Aquí no se escribe ni se publica nada: este paso solo decide qué merece un vistazo.',
    aboutLastRun: 'Sobre la última búsqueda',
    accepted: 'Merece la pena',
    acceptedEmpty: 'Esta vez no pasó nada el filtro.',
    recommended: 'Recomendados para este canal',
    recommendedEmpty: 'Esta vez no hay ningún tema muy cercano a este canal.',
    explore: 'Explorar más allá del canal',
    exploreEmpty: 'Esta vez no hay ideas más amplias.',
    exploreNote:
      'Estos temas pasaron las reglas de seguridad, pero todavía no comparten el vocabulario de tu canal. Son ideas para explorar, no recomendaciones.',
    rejected: 'Apartados',
    rejectedEmpty: 'No se apartó nada.',
    rejectedNote:
      'Se guardan con el motivo. Un tema descartado por una razón dudosa es justo aquel en el que podrías no estar de acuerdo, así que lo ves y decides tú.',
    dismissed: 'Ocultos',
    dismissedEmpty: 'Nada oculto.',
    showDismissed: 'Mostrar temas ocultos',
    empty:
      'Todavía no se ha encontrado nada para este canal. La primera búsqueda tarda unos minutos, porque nos mantenemos muy por debajo de lo que permiten las fuentes gratuitas.',
    noNiche: {
      title: 'Todavía no hay ningún canal configurado.',
      body: 'Los temas se puntúan frente al idioma y las áreas de un canal, así que primero hace falta uno.',
    },
    viewsPerMonth: (views: string) => `${views} visitas al mes`,
    links: (count: number) => (count === 1 ? '1 enlace de fuente' : `${count} enlaces de fuentes`),
    linksHelp: (floor: number) =>
      `Enlaces que salen del artículo de Wikipedia. Descartamos todo lo que tenga menos de ${floor}: un artículo pobre rara vez da material suficiente.`,
    trending: 'en las noticias',
    alreadyUsed: 'Ya utilizado',
    generate: 'Crear publicación',
    article: 'Leer el artículo',
    scoreHelp:
      'Puntuación total. La escala llega a 1,30 una vez contada la atención de hoy.',
    breakdown: (parts) =>
      `Interés duradero ${parts.lasting} · gente buscándolo ${parts.interest} · fuentes disponibles ${parts.sources} · encaja con tu canal ${parts.fit}`,
    recencyBoost: (multiplier: string) => `×${multiplier} por actualidad`,
    reasons: {
      'too-few-references': 'pocas fuentes',
      'disputed-or-outdated': 'marcado por los editores de Wikipedia',
      'living-person': 'persona viva',
      ymyl: 'salud, dinero o derecho',
      'too-new': 'artículo muy reciente',
      'single-recent-spike': 'noticia puntual',
      'no-article': 'no se encontró artículo',
    },
  },

  niches: {
    title: 'Canales',
    intro:
      'Un canal es toda tu configuración: el idioma, para quién escribes, cómo debe sonar, qué diseños de diapositiva usas y cuáles son tus reglas. Todo se cambia sin tocar código.',
    language: 'Idioma',
    audience: 'Escrito para',
    voice: 'Tono',
    formats: 'Diseños de diapositiva',
    seeds: 'Áreas temáticas',
    rules: 'Reglas',
    minConfidence: 'Cuánta certeza necesita un dato',
    requireSources: 'Cada publicación debe mostrar sus fuentes',
    publicInterest: 'Indicar que la publicación se hizo con ayuda de IA',
    forbidden: 'Nunca escribir sobre',
    cadence: 'Con qué frecuencia publicar',
    postsPerWeek: (count: number) =>
      count === 1 ? '1 publicación por semana' : `${count} publicaciones por semana`,
    default: 'Predeterminado',
    theme: 'Aspecto',
    invalid: (detail: string) =>
      `La configuración de este canal no es válida, así que todavía no se puede usar: ${detail}`,
    neverCovers: 'Nunca trata:',
    empty: {
      title: 'Todavía no hay canales.',
      body: (command: string) => `Ejecuta ${command} para añadir el canal de ejemplo.`,
    },
    footer:
      'Los canales parten de los ejemplos del código y viven en la base de datos una vez instalados.',
    footerLink: 'Crear una publicación con uno',
  },

  settings: {
    title: 'Ajustes',

    account: {
      heading: 'Tu cuenta',
      name: 'Tu nombre',
      nameHint: 'Aparece en el registro editorial de las publicaciones que apruebas.',
      email: 'Correo electrónico',
      emailHint: 'Con esto inicias sesión.',
      saveProfile: 'Guardar',
      saving: 'Guardando…',
      profileSaved: 'Guardado.',

      passwordHeading: 'Cambiar la contraseña',
      currentPassword: 'Contraseña actual',
      currentPasswordHint:
        'Se pide porque una sesión que quedó abierta en un ordenador compartido no debería bastar para dejarte fuera de tu propia cuenta.',
      newPassword: 'Contraseña nueva',
      newPasswordHint: 'Al menos 12 caracteres.',
      confirmPassword: 'Contraseña nueva otra vez',
      changePassword: 'Cambiar la contraseña',
      passwordChanged: 'Contraseña cambiada. Tus otras sesiones se han cerrado.',
      signOutOthers: 'Cerrar sesión en todo lo demás',
      signOutOthersHint: 'Termina todas las sesiones menos esta.',

      errors: {
        nameEmpty:
          'Pon un nombre: es lo que muestra el registro editorial en las publicaciones que apruebas.',
        emailInvalid: 'Eso no parece una dirección de correo.',
        emailTaken: 'Otra cuenta de aquí ya usa esa dirección.',
        wrongPassword: 'Esa no es tu contraseña actual.',
        tooShort: (min: number) => `Una contraseña necesita al menos ${min} caracteres.`,
        mismatch: 'Las dos contraseñas nuevas no son iguales.',
        sameAsOld: 'Esa es la contraseña que ya tienes.',
        failed: 'No se pudo guardar. Inténtalo otra vez.',
      },
    },

    language: {
      heading: 'Idioma',
      interface: 'Idioma del panel',
      interfaceHelp:
        'Lo que ves aquí: botones, etiquetas y textos de ayuda. No cambia las publicaciones que ya has creado.',
      output: 'Idioma de los canales nuevos',
      outputHelp:
        'Los canales nuevos empiezan en este idioma. Los que ya tienes conservan el suyo: así una misma cuenta puede llevar un canal en alemán y otro en inglés a la vez.',
      followInterface: 'Igual que el panel',
      saved: 'Idioma guardado.',
    },
    readiness: {
      usedByChannels: (names: string) =>
        `Publica para: ${names}. Si esta cuenta se desconecta o se eliminan sus datos, esos canales dejan de poder publicar hasta que se les asigne otra cuenta.`,
      heading: 'Antes de poder publicar',
      guidedSetup: 'Guíame paso a paso →',
      appUrl: 'Dirección pública para los retornos de Meta',
      images: 'Instagram puede acceder a las imágenes de tus diapositivas',
      imagesNotSet: 'Todavía sin configurar',
      account: 'Cuenta de Instagram conectada',
      accountNone: 'Todavía sin conectar',
      token: 'La conexión está activa',
      tokenNone: 'Todavía sin conectar',
      tokenDays: (days: number) =>
        `Se renueva automáticamente. Quedan ${days} días en la conexión actual.`,
      imagesWarning:
        'Instagram carga las imágenes de tus diapositivas desde sus propios servidores, así que tienen que estar en una dirección web pública. Una dirección local funciona aquí en el panel y falla justo en el momento de publicar.',
    },
    connect: {
      headingNew: 'Conectar Instagram',
      headingExisting: 'Volver a conectar Instagram',
      intro:
        'Claimfold usa tu propia app de Meta, no la nuestra. Eso es lo que te ahorra el proceso de revisión de Meta: sin solicitud, sin verificación de empresa, sin esperas. Crea una app en {link}, añádele Instagram y añade tu propia cuenta de Instagram como usuario.',
      stepByStep: 'Mejor paso a paso',
      redirectLabel: 'Dirección de retorno para añadir a tu app de Meta',
      appId: 'ID de app de Instagram',
      appSecret: 'Secreto de app de Instagram',
      secretNote: 'Se cifra antes de guardarse y no se vuelve a mostrar.',
      submitNew: 'Conectar Instagram',
      submitExisting: 'Volver a conectar',
    },
  },

  setup: {
    stepDone: 'completado',
    title: 'Configurar la publicación',
    stepOf: (step: number, total: number) => `Paso ${step} de ${total}`,
    notChecked: 'Esto no lo podemos comprobar desde aquí.',
    doneContinue: 'Hecho: continuar',
    skipForNow: 'Omitir por ahora',
    steps: {
      account: { short: 'Cuenta', title: 'Una cuenta profesional' },
      metaApp: { short: 'App de Meta', title: 'Tu propia app de Meta' },
      redirect: { short: 'Dirección de retorno', title: 'Añadir la dirección de retorno' },
      connect: { short: 'Conectar', title: 'Conectar tu cuenta' },
      ready: { short: 'Listo', title: 'Listo para publicar' },
    },
    account: {
      body: 'Instagram solo deja que una app publique en una cuenta profesional: Business o Creador. Una cuenta personal se rechaza, y te enteras justo cuando intentas publicar, así que conviene hacerlo primero.',
      how: 'Esto se cambia en la propia app de Instagram, en los ajustes de tu cuenta. Es gratis y se puede deshacer.',
      unverifiable:
        'No podemos ver el tipo de tu cuenta hasta que estés conectado. Si te saltas este paso, aparece en el paso 4 como una conexión fallida, no ahora como un aviso.',
    },
    metaApp: {
      body: 'Claimfold habla con Instagram como tu app, no como la nuestra. Crea una en {link}, añádele Instagram y elige el inicio de sesión de Instagram en lugar del de Facebook: así no necesitas una página de Facebook.',
      roleHolder:
        'Después añade tu propia cuenta de Instagram como usuario de la app. Este es el paso que te ahorra semanas: una app que solo toca cuentas asociadas a ella no necesita la revisión de Meta. Si todos compartiéramos una sola app, Meta exigiría una revisión completa antes de tu primera publicación.',
      reference: 'Documentación de Meta:',
      unverifiable: 'Lo que hay dentro de tu app de Meta esta instalación no puede verlo.',
    },
    redirect: {
      alsoRequired:
        'Meta también exige estas dos antes de permitir guardar la app. Son endpoints reales de esta instalación: la primera es cómo Instagram avisa de que alguien ha desconectado su cuenta, la segunda es cómo una persona pide que se eliminen sus datos.',
      deauthorizeLabel: 'URL de devolución de llamada de desautorización',
      dataDeletionLabel: 'URL de solicitud de eliminación de datos',
      body: 'Añade esta dirección web a tu app de Meta como URI de redirección: la dirección a la que Instagram te devuelve después de aceptar la conexión. Meta la compara letra por letra, así que una barra de más o http en lugar de https basta para romperlo, y el mensaje de error no te lo dirá. Cópiala en lugar de escribirla a mano.',
      localWarning:
        'Esto apunta a tu propio equipo, lo cual está bien mientras configuras. Para publicar de verdad necesitas una dirección web pública: cuando la tengas, define APP_URL y añade también la nueva dirección en la app de Meta. Meta compara de forma exacta, así que es una segunda entrada, no un reemplazo.',
      unverifiable:
        'Si Meta lo tiene guardado solo se sabe probándolo, que es el paso siguiente.',
    },
    connect: {
      connected: (username: string) =>
        `Conectado como @${username}. Volver a conectar lo reemplaza, algo útil si la conexión dejó de funcionar o si cambias de cuenta.`,
      body: 'Pega los dos valores y acepta la conexión. Se te enviará a Instagram, se te pedirán tres permisos y volverás aquí directamente.',
      warningTitle: 'No es el App ID de arriba de la página',
      warningBody:
        'El inicio de sesión de Instagram usa el ID y el secreto de app de Instagram, que pertenecen a la sección de Instagram dentro de tu app de Meta, no al App ID de Meta que aparece en la cabecera. Ambos son números largos, así que pegar el equivocado falla con un mensaje que no menciona ninguno de los dos. Si la conexión falla y el error es vago, empieza por comprobar esto.',
      warningRelabel:
        'Meta cambia los nombres de este panel a menudo, así que busca la página de configuración de la propia sección de Instagram (la misma que pide la dirección de retorno) en lugar de un menú con un nombre concreto.',
    },
    ready: {
      allGood:
        'Está todo lo necesario. Nada se publica solo: una publicación aún tiene que sostenerse y que tú la apruebes.',
      canary:
        'Antes de programar una publicación real, publica un carrusel de prueba aprobado en una cuenta de prueba y revísalo en Instagram. La lista de comprobación del canario en directo, en la documentación, indica qué comprobar.',
      blocked:
        'No puedes publicar hasta que todas las líneas de arriba estén en verde. Programar antes significa que falle justo cuando debía salir, cuando nadie está mirando.',
    },
  },

  review: {
    scheduledFor: (when: string) => `Programado para ${when}.`,
    scheduledSoon: 'Sale en cuanto el worker lo recoja.',
    rescheduleTo: 'Mover a',
    reschedule: 'Mover',
    rescheduling: 'Moviendo…',
    unschedule: 'Quitar de la programación',
    unscheduling: 'Quitando…',
    unscheduleHint:
      'Quitarlo devuelve la publicación a revisión. No se elimina nada.',
    title: 'Revisión',
    record: 'Fuentes y decisiones',
    reject: 'Detener esta publicación',
    approve: 'Aprobar',
    approveNow: 'Aprobar y publicar ahora',
    approveScheduled: 'Aprobar y programar',
    approveBlocked: 'Resuelve primero los puntos de abajo',
    rejectReason: 'Por qué (opcional)',
    rejectReasonPlaceholder: 'Queda en el registro editorial',
    viewOnInstagram: 'Ver en Instagram',
    performance: 'Cómo fue',
    metricSaved: 'Guardados',
    metricShares: 'Compartidos',
    metricReach: 'Alcance',
    metricComments: 'Comentarios',
    metricLikes: 'Me gusta',
    metricFollows: 'Nuevos seguidores',
    metricAsOf: 'Medido',
    reviewNote: 'Nota',
    loadingTitle: 'Cargando publicación…',
    publishProblem: 'Problema al publicar',
    attemptCount: (n: number) => `${n} intentos`,
    slides: 'Diapositivas',
    noSlides:
      'No se escribió nada. La comprobación detuvo esta publicación antes de redactarla, así que no hay diapositivas: los motivos están arriba y cada fuente abierta consta en el registro.',
    noSlidesAction: 'Abrir el registro',
    noClaims: 'No se registraron afirmaciones, así que aquí no hay nada en lo que basar una aprobación.',
    caption: 'Texto del pie',
    captionCount: (used: number, max: number) => `${used} de ${max} caracteres`,
    noAltText: 'sin texto alternativo',
    evidence: (count: number) =>
      count === 1 ? 'En qué se basa · 1 afirmación' : `En qué se basa · ${count} afirmaciones`,
    core: 'afirmación clave',
    ready: 'Listo para publicar',
    blocked: (count: number) =>
      count === 1 ? 'Bloqueado: 1 punto por resolver' : `Bloqueado: ${count} puntos por resolver`,
    allGood: 'Cada afirmación clave tiene fuentes y supera la certeza que fijaste.',
    overridden: 'Alguien lo aceptó de todos modos',
    overridePlaceholder: '¿Por qué es aceptable de todos modos?',
    override: 'Aceptar igualmente',
    publishAt: 'Publicar el',
    publishAtHint: 'Déjalo vacío para publicar lo antes posible.',
    approving: 'Aprobando…',
    rejecting: 'Deteniendo…',
    overriding: 'Guardando…',
    publishesTo: 'Publica en',
    publishesToNone: 'Sin cuenta: esto no se puede publicar',
    changeAccount: 'Cambiar',
    accountFromChannel: 'Tomado del canal. Cambiarlo aquí solo afecta a esta publicación.',
    unusableLink: 'el enlace no se puede abrir',

    edit: {
      open: 'Editar',
      cancel: 'Cancelar',
      save: 'Guardar',
      saving: 'Guardando…',
      tabText: 'Texto',
      tabLook: 'Aspecto',
      altText: 'Texto alternativo',
      altTextHint:
        'Describe la diapositiva para quien usa lector de pantalla, e Instagram lo indexa. Hace falta antes de poder aprobar.',
      headline: 'Titular',
      body: 'Texto',
      kicker: 'Antetítulo',
      footnote: 'Nota al pie',
      figure: 'Cifra',
      figureBadge: 'Número de posición',
      figureDate: 'Fecha',
      figureLabel: 'Qué mide la cifra',
      items: 'Líneas',
      panelTop: 'Panel de arriba',
      panelBottom: 'Panel de abajo',
      addLine: 'Añadir una línea',
      removeLine: 'Quitar esta línea',
      layout: 'Diseño',
      layoutInherit: 'Igual que el resto de la publicación',
      layoutFixed:
        'La diapositiva de apertura, la de fuentes y la de cierre se ven igual con cualquier diseño, para que el carrusel se lea como un conjunto.',
      layouts: {
        editorial: 'Editorial',
        split: 'Dos paneles',
        list: 'Numerado',
        timeline: 'Cronología',
        figure: 'Cifra grande',
        photo: 'Foto',
      },
      picture: 'Imagen',
      pictureNone: 'Sin imagen',
      pictureOption: 'Imagen {n}',
      pictureUpload: 'Subir una imagen',
      pictureUploading: 'Subiendo…',
      pictureRecent: 'Ya subidas',
      pictureRemove: 'Quitar la imagen',
      pictureHint:
        'El texto nunca se apoya directamente en la foto: se apoya en un velo del color del tema, así se lee bien haga lo que haga la imagen ahí.',
      moveUp: 'Hacia el principio',
      moveDown: 'Hacia el final',
      remove: 'Borrar esta diapositiva',
      add: 'Añadir una diapositiva',
      addHere: 'Insertar una diapositiva aquí',
      addRole: 'Tipo de diapositiva',
      appearance: 'Cómo se ven todas las diapositivas',
      theme: 'Tema',
      accent: 'Color de acento',
      accentHint: 'En blanco se queda el del tema.',
      watermark: 'Marca de agua',
      watermarkHint: 'Se ve pequeña en cada diapositiva. Normalmente tu usuario.',
      apply: 'Aplicar',
      applying: 'Aplicando…',
      editedByHand: 'editada a mano',
      caption: 'Pie de foto',
      hashtags: 'Hashtags',
      hashtagsHint:
        'Separados por espacios o comas. Tres a cinco que encajen valen más que treinta.',
      firstComment: 'Primer comentario',
      firstCommentHint: 'Se publica como comentario justo después. Buen sitio para las fuentes, así no se comen la primera línea del pie de foto.',
      hook: 'Gancho',
      hookHint: 'Se guarda aparte, para ver qué aperturas consiguen que se guarde el post.',
    },

    editErrors: {
      alreadyPublishing:
        'Esta publicación se está publicando ahora mismo y no se puede cambiar. Espera a que termine.',
      badSchedule: 'No es una fecha y hora válidas.',
      overrideTooShort:
        'Escribe un motivo de al menos 10 caracteres. Queda registrado a tu nombre en el historial, así que debe decir algo.',
      stale:
        'Alguien cambió esta diapositiva mientras la tenías abierta. No se guardó nada: recarga y vuelve a intentarlo.',
      missing: 'Esa diapositiva ya no forma parte de esta publicación.',
      notEditable:
        'Una publicación programada o ya publicada no se puede editar. Detenla primero si necesitas cambiarla.',
      notPermitted:
        'Tu rol en este espacio de trabajo no lo permite. Un propietario o admin puede cambiarlo en la lista de miembros.',
      shapeChanged:
        'El carrusel cambió mientras lo mirabas. No se guardó nada: recarga y vuelve a intentarlo.',
      tooFew: 'Un carrusel necesita al menos dos diapositivas, así que esta no puede irse.',
      tooMany: (max: number) => `Instagram admite como máximo ${max} diapositivas.`,
      badField: 'El formulario traía un campo que este diseño no usa, así que no se guardó nada.',
      accentNotAColour: 'Da el color en hexadecimal, por ejemplo #B4472B.',
      accentUnreadable: (ratio: string, floor: string) =>
        `Ese color solo llega a ${ratio}:1 contra el tema, y el texto necesita ${floor}:1 para seguir legible a un brazo de distancia.`,
      uploadTooLarge: (mb: number) => `Esa imagen pasa de ${mb} MB.`,
      uploadNotAnImage: 'Ese archivo no se pudo leer como imagen.',
      uploadMissing: 'No venía ninguna imagen.',
      noRole: 'Elige qué tipo de diapositiva añadir.',
    },
    verdicts: {
      supported: 'las fuentes coinciden',
      disputed: 'las fuentes discrepan',
      false: 'las fuentes lo contradicen',
      unverifiable: 'no se encontró una buena fuente',
    },
  },

  channels: {
    create: 'Canal nuevo',
    createTitle: 'Canal nuevo',
    editTitle: 'Editar el canal',
    edit: 'Editar',
    duplicate: 'Duplicar',
    archive: 'Retirar',
    restore: 'Volver a activarlo',
    archivedHeading: 'Retirados',
    archivedNote:
      'Un canal retirado queda oculto del tablero y no puede crear publicaciones nuevas. No se borra nada: las publicaciones que hizo conservan su registro.',
    saved: 'Canal guardado.',
    generatedBanner:
      'Esbozado a partir de tu descripción. Léelo antes de usarlo: la certeza que exige y los temas que se niega a tocar se deciden aquí.',
    copyOf: (name: string) => `${name} (copia)`,

    generator: {
      heading: 'Describe un canal en una frase',
      hint: '¿De qué va, para quién es y más o menos cómo debe sonar? Con dos frases basta.',
      placeholder:
        'Publicaciones en español sobre ideas equivocadas comunes en historia, para adultos curiosos a los que les gusta sorprenderse.',
      language: 'Escrito en',
      submit: 'Esbozar un canal',
      working: 'Esbozando…',
      cost:
        'Una llamada corta al modelo, unos céntimos. Acabas en el editor y no se usa nada hasta que guardas.',
    },

    form: {
      identityHeading: 'Identidad',
      name: 'Nombre',
      slug: 'Nombre corto',
      slugHint: 'Minúsculas, dígitos y guiones. Se usa en los enlaces, nunca lo ve un lector.',
      description: 'Descripción',
      descriptionHint: 'Una nota para ti. No se envía al modelo.',
      language: 'Idioma de las publicaciones',
      languageHint:
        'Una etiqueta BCP-47: de, en, pt-BR. Decide en qué idioma se escribe, y también la división de palabras, las fechas y los números.',

      voiceHeading: 'Tono',
      audience: 'Escrito para',
      audienceHint:
        'Va palabra por palabra en cada instrucción, así que escríbelo como una indicación y no como publicidad. «Principiantes que ya tienen las herramientas y tropiezan siempre con las mismas tres cosas» sirve; «todos los interesados en bricolaje» no.',
      voice: 'Cómo debe sonar',
      voiceHint: 'También va palabra por palabra, en el paso de redacción.',

      whatHeading: 'Qué produce',
      topicSeeds: 'Áreas temáticas',
      topicSeedsHint:
        'Una por línea. Áreas que puedan sostener varias publicaciones cada una, no títulos de publicaciones sueltas.',
      formats: 'Diseños de diapositiva',
      formatsHint:
        'Al menos uno. Un diseño describe la forma de un argumento — una afirmación y su prueba, una lista ordenada, un antes y un después — así que cualquier tema encaja en cualquiera.',
      hashtagSets: 'Conjuntos de hashtags',
      hashtagSetsHint:
        'Un conjunto por línea, separados por espacios. Desde que no se pueden seguir hashtags son metadatos de búsqueda: tres a cinco que encajen valen más que treinta.',

      account: 'Publica en',
      accountHint: 'En qué cuenta de Instagram conectada publica este canal. Se elige aquí y no por publicación, para que la marca de agua y la cuenta nunca nombren usuarios distintos.',
      accountNone: 'Sin cuenta elegida',
      accountNoneAvailable: 'Todavía no hay ninguna cuenta de Instagram conectada. Conecta una en Ajustes y vuelve a elegirla aquí.',
      lookHeading: 'Aspecto',
      theme: 'Tema',
      accent: 'Color de acento',
      accentHint: 'En blanco se queda el del tema. Se comprueba la legibilidad antes de guardar.',
      watermark: 'Marca de agua',
      watermarkHint: 'Se ve pequeña en cada diapositiva. Normalmente tu usuario.',

      rulesHeading: 'Reglas',
      requireSources: 'Cada publicación debe mostrar sus fuentes',
      requireSourcesHint:
        'Es lo que hace que una publicación esté sustancialmente transformada según la política de originalidad de Instagram. Conviene dejarlo activado para todo lo factual.',
      publicInterest: 'Esto toca salud, dinero, derecho, seguridad o política',
      publicInterestHint:
        'Sube el nivel que una afirmación tiene que alcanzar y activa la etiqueta de IA por defecto, que es lo que pide el reglamento europeo de IA en estos temas.',
      requireAdLabel: 'Marcar como publicidad cuando una publicación lleve un enlace comercial',
      requireAdLabelHint: '§ 5a UWG, para operadores en Alemania. Desactivarlo es una decisión.',
      minConfidence: 'Cuánta certeza hace falta',
      minConfidenceHint:
        'Entre 0,5 y 1. Una afirmación clave por debajo retiene la publicación, y ningún canal puede bajar más — ese suelo es lo que mantiene útil la comprobación.',
      forbiddenTopics: 'Nunca escribir sobre',
      forbiddenTopicsHint: 'Uno por línea. Se rechaza mientras las ideas se están esbozando.',

      promptHeading: 'Instrucciones adicionales',
      promptIntro:
        'Se añaden al final de las instrucciones de un paso. A propósito no hay campo para el paso de investigación: un canal no debe poder decirle qué concluir.',
      promptIdeate: 'Al buscar ideas',
      promptWrite: 'Al escribir las diapositivas',

      cadenceHeading: 'Con qué frecuencia',
      cadenceNotWiredUp:
        'Se guarda, pero todavía no se publica nada automáticamente. Estos ajustes quedan registrados para cuando exista la publicación recurrente — por ahora cada publicación se programa individualmente al aprobarla.',
      postsPerWeek: 'Publicaciones por semana',
      preferredTimes: 'Horas preferidas',
      preferredTimesHint: 'HH:mm, separadas por espacios.',
      timezone: 'Zona horaria',
      timezoneHint: 'Un nombre IANA, como Europe/Berlin.',

      makeDefault: 'Usar este canal por defecto',
      save: 'Guardar el canal',
      saving: 'Guardando…',
      cancel: 'Cancelar',
      problems: 'Hay cosas que arreglar antes de poder guardar:',
    },

    errors: {
      slugTaken: 'Otro canal de este espacio de trabajo ya usa ese nombre corto.',
      missing: 'Ese canal ya no existe.',
      describeMore: 'Dale una o dos frases con las que trabajar.',
      generateFailed: (detail: string) =>
        `El canal no se pudo esbozar: ${detail}. Comprueba que en tu .env haya configurado un proveedor de modelo.`,
      generateUnusable:
        'Lo que volvió no daría un canal utilizable. Descríbelo algo distinto, o empieza con uno en blanco.',
    },
  },

  /**
   * The licence banner. Reports only — no feature is gated on any of this.
   */
  license: {
    expired: (licensee: string, on: string) => `La licencia de ${licensee} caducó el ${on}.`,
    invalid: (reason: string) => `Esta clave de licencia no se aceptó: ${reason}`,
    unverifiable: 'Hay una clave de licencia puesta, pero a esta compilación le falta la clave de firma para comprobarla: es un fallo nuestro de empaquetado, no tuyo.',
    nothingRestricted: 'No se restringe nada. Todo sigue funcionando igual que antes.',
  },

  record: {
    kicker: 'Registro editorial',
    backToReview: '← Volver a la revisión',
    downloadJson: 'Descargar JSON',
    downloadCsv: 'Descargar CSV',
    printHint: 'Imprime esta página para obtener un PDF.',
    untitled: 'Publicación sin título',
    summary: 'Resumen',
    postId: 'Identificador de la publicación',
    created: 'Creada',
    approved: 'Aprobada',
    responsibility: 'Quién asumió la responsabilidad',
    notApproved: 'Todavía sin aprobar',
    published: 'Publicada',
    igMediaId: 'Identificador de medio de Instagram',
    aiDisclosure: 'Aviso de IA',
    labelled: 'Indicada como hecha con ayuda de IA',
    notLabelled: 'Sin indicar',
    confidenceFloor: 'Certeza exigida',
    confidenceFloorValue: (value: string) => `${value} (lo fija el canal)`,
    claimsLabel: 'Afirmaciones',
    claimsValue: (checked: number, core: number, overridden: number) =>
      `${checked} buscadas · ${core} clave · ${overridden} aceptadas igualmente`,
    pagesConsulted: 'Páginas abiertas',
    unresolved: (count: number) =>
      count === 1
        ? 'Una afirmación clave no alcanzó la certeza exigida y nadie la aceptó igualmente. Esta publicación no se podía publicar cuando se generó este registro.'
        : `${count} afirmaciones clave no alcanzaron la certeza exigida y nadie las aceptó igualmente. Esta publicación no se podía publicar cuando se generó este registro.`,
    claimsTitle: (count: number) => `Afirmaciones y lo que dijeron las fuentes (${count})`,
    noClaims: 'No se registraron afirmaciones para esta publicación.',
    noSources: 'No se registraron fuentes.',
    core: 'clave',
    overriddenBy: 'Aceptado igualmente',
    overriddenByUnknown: 'una persona que ya no está en este espacio de trabajo',
    slidesTitle: (count: number) => `Diapositivas (${count})`,
    nothingWritten:
      'No se escribió nada: la comprobación detuvo esta publicación antes de la fase de redacción.',
    altText: 'Texto alternativo:',
    editedByHand: 'Editada a mano después de la investigación:',
    captionTitle: 'Texto del pie',
    reviewNoteTitle: 'Nota',
    consultedTitle: (count: number) => `Páginas abiertas (${count})`,
    consultedIntro: 'Todo lo que abrió la fase de investigación, se citara o no.',
    producedAt: (stamp: string, id: string) =>
      `Generado el ${stamp} a partir del registro guardado de la publicación ${id}.`,
    disclaimer:
      'Este documento deja constancia de qué se investigó, qué dijeron las fuentes y quién asumió la responsabilidad editorial. No certifica que ninguna afirmación sea cierta.',
  },

  members: {
    title: 'Personas',
    intro:
      'Quién puede usar este espacio y qué puede hacer. Una invitación es un enlace que envías tú — una instalación autoalojada no tiene servidor de correo, así que no se envía nada en tu nombre.',
    people: 'En este espacio',
    pending: 'Invitadas, aún sin entrar',
    invite: 'Invitar a alguien',
    email: 'Su correo',
    role: 'Rol',
    createInvite: 'Crear enlace de invitación',
    creatingInvite: 'Creando…',
    inviteReady: 'Invitación lista. Envía este enlace a la persona invitada.',
    inviteLink: 'Enlace de invitación',
    inviteOnce:
      'Se muestra una sola vez. Quien tenga el enlace entrará con el rol elegido: trátalo como una contraseña. Caduca a los siete días.',
    inviteHint:
      'Tendrá que iniciar sesión o crear una cuenta con exactamente esa dirección. Pon ALLOW_SIGNUP=true mientras lo hace y luego quítalo.',
    expires: (when: string) => `Caduca el ${when}`,
    revoke: 'Revocar',
    revoking: 'Revocando…',
    remove: 'Quitar',
    removing: 'Quitando…',
    you: '(tú)',
    roles: {
      owner: 'Propietario — todo, incluida la facturación',
      admin: 'Admin — todo salvo la propiedad',
      editor: 'Editor — escribir y editar, sin aprobar',
      viewer: 'Lector — solo lectura',
    },
    errors: {
      notPermitted: 'Tu rol no permite gestionar personas.',
      badEmail: 'Eso no parece una dirección de correo.',
      badRole: 'Ese rol no se puede asignar.',
      notYourself: 'No puedes cambiar tu propio rol ni quitarte a ti mismo.',
      cannotChangeOwner: 'El propietario del espacio no se puede cambiar ni quitar.',
    },
  },

  invite: {
    title: 'Esta invitación no se ha podido usar.',
    joinTitle: 'Unirse al espacio de trabajo',
    joinPrompt:
      'Has iniciado sesión. Únete al espacio de trabajo solo si esta invitación es para ti.',
    join: 'Unirse al espacio',
    joining: 'Uniéndote…',
    activateFailed:
      'Te uniste al espacio de trabajo, pero no se pudo abrir. Inténtalo de nuevo.',
    invalid: 'El enlace ha caducado, se ha revocado o ya se usó. Pide uno nuevo.',
    alreadyMember: 'Ya estás en este espacio, así que no había nada que aceptar.',
    wrongEmail: (invited: string, current: string) =>
      `Esta invitación era para ${invited} y has iniciado sesión como ${current}. Entra con la dirección invitada o pide una invitación para esta.`,
  },

  noWorkspace: {
    title: 'Todavía no estás en ningún espacio de trabajo',
    explain: (email: string) =>
      `Has iniciado sesión como ${email}, pero no perteneces a ningún espacio de trabajo. Las publicaciones, los canales y las cuentas de Instagram viven dentro de uno, así que no hay nada que mostrarte hasta que estés en él.`,
    pasteLabel: 'Enlace de invitación',
    pasteHint:
      'Si alguien te invitó, pega aquí el enlace completo que te envió. Un enlace deja de funcionar a los siete días de crearse.',
    pasteAction: 'Abrir la invitación',
    pasteInvalid:
      'Esto no parece un enlace de invitación. Pega el enlace completo que recibiste o pide uno nuevo.',
    startTitle: 'O crea el tuyo',
    startHint:
      'Crea un espacio vacío que solo ves tú. Después podrás aceptar igualmente una invitación y cambiar entre los dos.',
    startAction: 'Crear un espacio',
    startFailed: 'No se pudo crear el espacio de trabajo. Inténtalo de nuevo.',
    signOut: 'Cerrar sesión',
  },

  workspace: {
    select: 'Cambiar de espacio de trabajo',
    failed: 'No se pudo cambiar de espacio de trabajo. Inténtalo de nuevo.',
  },

  errors: {
    chooseNiche: 'Elige primero un canal.',
    notPermitted: 'Tu rol en este espacio de trabajo no permite crear publicaciones.',
    notPermittedTopics: 'Tu rol en este espacio de trabajo no permite buscar temas.',
    pageTitle: 'Esta página no se pudo cargar.',
    pageBody:
      'El fallo está en el servidor, no en tu navegador: recargar suele bastar. Si sigue pasando, la terminal donde corre el panel indica el motivo.',
    pageRetry: 'Intentar de nuevo',
    pageBack: 'Volver al tablero',
    notFoundTitle: 'Esta página no existe.',
    notFoundBody:
      'Puede que el enlace esté desactualizado, o que lo que había aquí se haya eliminado. No pasa nada con tu cuenta.',
    slideCountRange: (max: number) =>
      `El número de diapositivas tiene que ser un entero entre 2 y ${max}.`,
    nicheMissing: 'Ese canal no existe.',
    nicheInvalid: (detail: string) =>
      `Este canal no se puede usar hasta que se corrija su configuración: ${detail}`,
    generateBusy: 'Ya se está creando una publicación. Espera a que termine.',
    duplicateIdea: 'Esa idea ya se hizo antes, así que no se guardó otra vez. Prueba otro tema, o déjalo vacío para algo nuevo.',
    generateFailed: (detail: string) => `No se pudo crear la publicación: ${detail}`,
    discoverBusy: 'Ya hay una búsqueda de temas en marcha. Espera a que termine.',
    discoverFailed: (detail: string) => `La búsqueda de temas no pudo terminar: ${detail}`,
    appIdFormat:
      'El ID de app de Instagram es el número largo de la sección de Instagram de tu app de Meta.',
    appSecretFormat:
      'Eso no parece un secreto de app de Instagram. Cópialo de la misma página que el ID.',
    instagramDeclined: (detail: string) => `Instagram rechazó la conexión: ${detail}`,
    connectExpired: 'El intento de conexión caducó. Inténtalo de nuevo.',
    connectUnverified: 'No pudimos confirmar esa conexión. Empieza de nuevo.',
    connectNoPending: 'No había ninguna conexión pendiente de terminar. Empieza de nuevo.',
    connectNoPublish:
      'Conectado, pero no se concedió el permiso para publicar. Vuelve a conectar y permite los tres.',
    connectFailed: (detail: string) => `No se pudo terminar la conexión: ${detail}`,
    connected: (username: string) => `Conectado como @${username}.`,
  },

  appearance: {
    heading: 'Apariencia',
    theme: 'Tema',
    themeSystem: 'Como mi dispositivo',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    density: 'Altura de las filas',
    densityHelp:
      'Cuánto cabe en pantalla. Compacto muestra más de una vez; amplio se recorre con más calma.',
    densityCompact: 'Compacto',
    densityComfortable: 'Normal',
    densitySpacious: 'Amplio',
    toggleSidebar: 'Contraer el menú',
    expandSidebar: 'Expandir el menú',
    skipToContent: 'Ir al contenido',
    loading: 'Cargando',
    openMenu: 'Abrir el menú',
    closeMenu: 'Cerrar el menú',
  },

  palette: {
    open: 'Buscar',
    placeholder: 'Ir a…',
    noResults: 'No coincide nada.',
    hint: 'Esc para cerrar',
    goTo: 'Ir a',
    setupTitle: 'Configurar la publicación',
  },

  gate: {
    claim_false: (p) =>
      p['scope'] === 'incidental'
        ? `Las fuentes dicen lo contrario y no es central: quítalo. «${p['claim']}»`
        : `Las fuentes contradicen una afirmación clave: «${p['claim']}»`,
    claim_unverifiable: (p) =>
      `No se encontró ninguna fuente utilizable para una afirmación clave: «${p['claim']}»`,
    claim_low_confidence: (p) =>
      `Una afirmación clave tiene menos certeza de la que permite este canal (${p['confidence']}, exigido ${p['floor']}): «${p['claim']}»`,
    claim_unsourced: (p) => `Una afirmación clave no tiene ninguna fuente que citar: «${p['claim']}»`,
    claim_disputed: (p) =>
      `Las fuentes discrepan, así que hay que presentarlo como discutido: «${p['claim']}»`,
    claim_resolved_by_human: (p) =>
      `Alguien lo aceptó igualmente, aunque las fuentes dicen «${p['verdict']}»: «${p['claim']}»`,
    not_verified: () => 'Todavía no se ha buscado nada de esta publicación en fuentes.',
    caption_too_long: (p) =>
      `El texto del pie tiene ${p['length']} caracteres. Instagram permite ${p['max']}.`,
    too_many_hashtags: (p) => `${p['count']} hashtags. Instagram permite ${p['max']}.`,
    missing_alt_text: (p) => `La diapositiva ${p['slide']} no tiene texto alternativo.`,
    slide_count: (p) => `${p['count']} diapositivas. Un carrusel necesita entre 2 y 10.`,
    plan_mismatch: (p) =>
      `La publicación tiene ${p['actual']} diapositivas y el diseño esperaba ${p['expected']}.`,
    role_mismatch: (p) =>
      `La diapositiva ${p['slide']} es de tipo «${p['actual']}» donde el diseño esperaba «${p['expected']}».`,
    slide_edited_after_check: (p) =>
      `La diapositiva ${p['slide']} se editó a mano después de consultar sus afirmaciones. Lo que dicen las fuentes de abajo se leyó contra la redacción anterior.`,
    hook_not_first: (p) =>
      `La publicación abre con una diapositiva «${p['role']}» en lugar del gancho. La primera es la única que ve la mayoría.`,
    no_account: () => 'Esta publicación no tiene ninguna cuenta de Instagram a la que publicar. Elige una en su canal.',
    account_not_connected: (p) => `La cuenta @${p['username']} está «${p['status']}» y no conectada, así que publicar fallaría. Vuelve a conectarla en Ajustes.`,
    missing_sources_slide: () =>
      'Este canal exige que cada publicación muestre sus fuentes, y no hay diapositiva de fuentes.',
    ad_label_required: () =>
      'Esta publicación lleva un enlace comercial y debe indicarse como publicidad antes de salir (§ 5a UWG en Alemania).',
  },

  runNotes: {
    sourceUnavailable: (p) => `No se pudo acceder a ${p['source']}: ${p['reason']}`,
    trendingCapped: (p) =>
      `Había ${p['available']} expresiones en tendencia; se consultaron las ${p['used']} primeras, porque cada una cuesta una petición del límite.`,
    seedsCapped: (p) =>
      `Este canal indica ${p['available']} áreas temáticas; se consultaron las ${p['used']} primeras. Cada una cuesta una petición del límite.`,
    forbiddenDropped: (p) =>
      `${p['count']} candidatos coincidían con temas que este canal excluye y se descartaron antes de medirlos.`,
    livingCheckFailed: (p) =>
      `La comprobación gratuita de «persona viva» no pudo ejecutarse (${p['reason']}), así que esos candidatos se midieron y se rechazaron después.`,
    livingDropped: (p) =>
      `${p['count']} candidatos se descartaron antes de medirlos porque son personas vivas. Esa comprobación cuesta dos peticiones y ahorra una por candidato, por eso la lista de artículos más leídos no llena el presupuesto con quien salió ayer en las noticias.`,
    budgetCapped: (p) =>
      `Se reunieron ${p['gathered']} candidatos y se midieron ${p['measured']}; el resto queda para una búsqueda posterior. El presupuesto existe porque el límite de peticiones es deliberadamente bajo: subirlo alarga la búsqueda en la misma proporción.`,
    measureFailed: (p) => `No se pudo medir «${p['title']}»: ${p['reason']}`,
  },

  status: {
    idea: 'Idea',
    drafted: 'Borrador',
    checked: 'Fuentes encontradas',
    rendered: 'Imágenes listas',
    review: 'Por revisar',
    approved: 'Aprobado',
    scheduled: 'Programado',
    publishing: 'Publicando',
    published: 'Publicado',
    failed: 'Falló',
    rejected: 'Detenido',
  },
}
