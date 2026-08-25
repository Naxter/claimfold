import type { Locale } from './locales.ts'

/**
 * The four strings the error boundary needs, in four languages.
 *
 * A separate, deliberately tiny module because `app/error.tsx` is a client
 * component and imported all four full catalogues *as values* to get at them.
 * That is not tree-shakeable — the object is indexed by a runtime locale — so
 * every locale's every string shipped to every browser.
 *
 * The comment in `error.tsx` argued the cost was acceptable "because the chunk
 * is only ever fetched when something has already gone wrong". That reasoning
 * was wrong, and measurably so: an error boundary lives in the root layout's
 * client graph, so its chunk is referenced from the initial HTML and loads
 * eagerly on every page. Fetching the built chunk and grepping it finds strings
 * from all four locales on a cold `/sign-in`.
 *
 * The four catalogues are 190,703 bytes of source, 61,728 gzipped. This file is
 * under a kilobyte, for the same rendered result.
 *
 * Kept in sync by construction: `Record<Locale, ErrorMessages>` means adding a
 * language fails the typecheck until it is translated here too, which is the
 * same guarantee the main catalogue has.
 */

export interface ErrorMessages {
  title: string
  body: string
  retry: string
  back: string
}

export const ERROR_MESSAGES: Record<Locale, ErrorMessages> = {
  en: {
    title: 'This page could not load.',
    body: 'Something failed on the server rather than in your browser, so reloading may well fix it. If it keeps happening, the terminal running the dashboard prints the reason.',
    retry: 'Try again',
    back: 'Back to the board',
  },
  de: {
    title: 'Diese Seite konnte nicht geladen werden.',
    body: 'Der Fehler liegt auf dem Server, nicht in deinem Browser — neu laden hilft oft schon. Wenn es weiter passiert, steht der Grund im Terminal, in dem das Dashboard läuft.',
    retry: 'Nochmal versuchen',
    back: 'Zurück zur Übersicht',
  },
  fr: {
    title: 'Cette page n’a pas pu se charger.',
    body: 'La panne vient du serveur, pas de ton navigateur : recharger suffit souvent. Si cela se répète, la raison s’affiche dans le terminal où tourne le tableau de bord.',
    retry: 'Réessayer',
    back: 'Retour au tableau',
  },
  es: {
    title: 'Esta página no se ha podido cargar.',
    body: 'El fallo está en el servidor, no en tu navegador, así que recargar suele bastar. Si sigue pasando, el motivo aparece en la terminal donde se ejecuta el panel.',
    retry: 'Intentar de nuevo',
    back: 'Volver al tablero',
  },
}
