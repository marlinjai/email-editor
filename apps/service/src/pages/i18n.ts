/**
 * The hosted unsubscribe page in five languages. Every locale is typed against
 * the English table, so a missing key fails the typecheck; a test checks it at
 * runtime as well. Placeholders are `{name}` and are filled with escaped values
 * by the renderer, never by string concatenation here.
 *
 * Register: British English, formal German (Sie), Italian (Lei), French (vous)
 * and Spanish (usted). The page serves every workspace, so the copy is plain and
 * neutral and never names the service's own brand as the sender.
 */

export const PAGE_LOCALES = ['en', 'de', 'it', 'fr', 'es'] as const;
export type PageLocale = (typeof PAGE_LOCALES)[number];

const en = {
  lang_name: 'English',
  language_label: 'Language',
  doc_title: 'Email preferences: {workspace}',
  manage_title: 'Email preferences',
  manage_lead: 'Choose which emails you receive from {workspace}.',
  address_line: 'Settings for {email}',
  topic_intro: 'You received this email because you are subscribed to {topic}.',
  topic_button: 'Unsubscribe from {topic}',
  topics_heading: 'Your topics',
  no_topics: 'This sender has not set up any topics yet.',
  state_subscribed: 'Subscribed',
  state_not_subscribed: 'Not subscribed',
  state_unsubscribed: 'Unsubscribed',
  state_paused: 'Paused by the sender',
  action_unsubscribe: 'Unsubscribe',
  action_resubscribe: 'Resubscribe',
  action_for_topic: 'from {topic}',
  action_to_topic: 'to {topic}',
  all_heading: 'All emails',
  all_text: 'Stop every email from {workspace}, whatever the topic.',
  all_button: 'Unsubscribe from all',
  all_blocked_text: 'You are unsubscribed from all emails from {workspace}.',
  all_resubscribe_button: 'Resubscribe to all',
  done_unsubscribed_title: 'You are unsubscribed',
  done_unsubscribed_topic: 'You will no longer receive {topic} emails from {workspace}.',
  done_unsubscribed_all: 'You will no longer receive any emails from {workspace}.',
  done_resubscribed_title: 'You are subscribed again',
  done_resubscribed_topic: 'You will receive {topic} emails from {workspace} again.',
  done_resubscribed_all: 'Emails from {workspace} can reach you again.',
  undo_prompt: 'Changed your mind?',
  undo_resubscribe: 'Resubscribe',
  undo_unsubscribe: 'Unsubscribe again',
  test_banner: 'This is a preview from a test email. Nothing you do here changes a subscription.',
  test_done: 'Preview only: nothing was changed.',
  gone_title: 'Nothing to change',
  gone_text: 'This address is no longer on the list of this sender, so this link will not lead to any further emails.',
  invalid_title: 'This link does not work',
  invalid_text:
    'The link may be incomplete or damaged. Please open it again from the email, or copy the whole address into your browser.',
  cross_site_title: 'Request not accepted',
  cross_site_text: 'This request came from another website and was not applied. Please use the link in the email.',
  error_title: 'Something went wrong',
  error_text: 'Your choice has not been saved. Please try again in a moment.',
  footer: 'This page manages the emails {workspace} sends you. It uses no cookies and no tracking.',
};

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

const de: Messages = {
  lang_name: 'Deutsch',
  language_label: 'Sprache',
  doc_title: 'E-Mail-Einstellungen: {workspace}',
  manage_title: 'E-Mail-Einstellungen',
  manage_lead: 'Wählen Sie, welche E-Mails Sie von {workspace} erhalten.',
  address_line: 'Einstellungen für {email}',
  topic_intro: 'Sie haben diese E-Mail erhalten, weil Sie {topic} abonniert haben.',
  topic_button: '{topic} abbestellen',
  topics_heading: 'Ihre Themen',
  no_topics: 'Dieser Absender hat noch keine Themen eingerichtet.',
  state_subscribed: 'Abonniert',
  state_not_subscribed: 'Nicht abonniert',
  state_unsubscribed: 'Abbestellt',
  state_paused: 'Vom Absender pausiert',
  action_unsubscribe: 'Abbestellen',
  action_resubscribe: 'Wieder abonnieren',
  action_for_topic: '{topic}',
  action_to_topic: '{topic}',
  all_heading: 'Alle E-Mails',
  all_text: 'Keine E-Mails mehr von {workspace} erhalten, gleich zu welchem Thema.',
  all_button: 'Alle abbestellen',
  all_blocked_text: 'Sie haben alle E-Mails von {workspace} abbestellt.',
  all_resubscribe_button: 'Alle wieder abonnieren',
  done_unsubscribed_title: 'Sie sind abgemeldet',
  done_unsubscribed_topic: 'Sie erhalten keine E-Mails zu {topic} von {workspace} mehr.',
  done_unsubscribed_all: 'Sie erhalten keine E-Mails von {workspace} mehr.',
  done_resubscribed_title: 'Sie sind wieder angemeldet',
  done_resubscribed_topic: 'Sie erhalten wieder E-Mails zu {topic} von {workspace}.',
  done_resubscribed_all: 'E-Mails von {workspace} erreichen Sie wieder.',
  undo_prompt: 'Doch anders entschieden?',
  undo_resubscribe: 'Wieder abonnieren',
  undo_unsubscribe: 'Erneut abbestellen',
  test_banner: 'Dies ist eine Vorschau aus einer Test-E-Mail. Was Sie hier tun, ändert kein Abonnement.',
  test_done: 'Nur Vorschau: Es wurde nichts geändert.',
  gone_title: 'Nichts zu ändern',
  gone_text:
    'Diese Adresse steht nicht mehr auf der Liste dieses Absenders. Über diesen Link erhalten Sie keine weiteren E-Mails.',
  invalid_title: 'Dieser Link funktioniert nicht',
  invalid_text:
    'Der Link ist möglicherweise unvollständig oder beschädigt. Bitte öffnen Sie ihn erneut aus der E-Mail oder kopieren Sie die vollständige Adresse in Ihren Browser.',
  cross_site_title: 'Anfrage nicht angenommen',
  cross_site_text:
    'Diese Anfrage kam von einer anderen Website und wurde nicht ausgeführt. Bitte verwenden Sie den Link in der E-Mail.',
  error_title: 'Etwas ist schiefgelaufen',
  error_text: 'Ihre Auswahl wurde nicht gespeichert. Bitte versuchen Sie es gleich noch einmal.',
  footer: 'Auf dieser Seite verwalten Sie die E-Mails, die {workspace} Ihnen sendet. Sie verwendet keine Cookies und kein Tracking.',
};

const it: Messages = {
  lang_name: 'Italiano',
  language_label: 'Lingua',
  doc_title: 'Preferenze email: {workspace}',
  manage_title: 'Preferenze email',
  manage_lead: 'Scelga quali email ricevere da {workspace}.',
  address_line: 'Impostazioni per {email}',
  topic_intro: 'Ha ricevuto questa email perché è iscritto/a a {topic}.',
  topic_button: 'Annulla l’iscrizione a {topic}',
  topics_heading: 'I Suoi argomenti',
  no_topics: 'Questo mittente non ha ancora configurato argomenti.',
  state_subscribed: 'Iscritto/a',
  state_not_subscribed: 'Non iscritto/a',
  state_unsubscribed: 'Iscrizione annullata',
  state_paused: 'Sospeso dal mittente',
  action_unsubscribe: 'Annulla l’iscrizione',
  action_resubscribe: 'Iscriviti di nuovo',
  action_for_topic: 'a {topic}',
  action_to_topic: 'a {topic}',
  all_heading: 'Tutte le email',
  all_text: 'Non ricevere più alcuna email da {workspace}, qualunque sia l’argomento.',
  all_button: 'Annulla tutte le iscrizioni',
  all_blocked_text: 'Ha annullato l’iscrizione a tutte le email di {workspace}.',
  all_resubscribe_button: 'Iscriviti di nuovo a tutto',
  done_unsubscribed_title: 'Iscrizione annullata',
  done_unsubscribed_topic: 'Non riceverà più email su {topic} da {workspace}.',
  done_unsubscribed_all: 'Non riceverà più alcuna email da {workspace}.',
  done_resubscribed_title: 'Di nuovo iscritto/a',
  done_resubscribed_topic: 'Riceverà di nuovo email su {topic} da {workspace}.',
  done_resubscribed_all: 'Le email di {workspace} possono di nuovo raggiungerLa.',
  undo_prompt: 'Ha cambiato idea?',
  undo_resubscribe: 'Iscriviti di nuovo',
  undo_unsubscribe: 'Annulla di nuovo l’iscrizione',
  test_banner: 'Questa è un’anteprima da un’email di prova. Nulla di ciò che fa qui modifica un’iscrizione.',
  test_done: 'Solo anteprima: non è stato modificato nulla.',
  gone_title: 'Nulla da modificare',
  gone_text:
    'Questo indirizzo non è più nell’elenco di questo mittente, quindi questo link non porterà ad altre email.',
  invalid_title: 'Questo link non funziona',
  invalid_text:
    'Il link potrebbe essere incompleto o danneggiato. Lo apra di nuovo dall’email oppure copi l’indirizzo completo nel browser.',
  cross_site_title: 'Richiesta non accettata',
  cross_site_text: 'Questa richiesta proviene da un altro sito web e non è stata applicata. Usi il link presente nell’email.',
  error_title: 'Si è verificato un problema',
  error_text: 'La Sua scelta non è stata salvata. Riprovi tra qualche istante.',
  footer: 'Questa pagina gestisce le email che {workspace} Le invia. Non usa cookie né tracciamento.',
};

const fr: Messages = {
  lang_name: 'Français',
  language_label: 'Langue',
  doc_title: 'Préférences e-mail : {workspace}',
  manage_title: 'Préférences e-mail',
  manage_lead: 'Choisissez les e-mails que vous recevez de {workspace}.',
  address_line: 'Paramètres pour {email}',
  topic_intro: 'Vous avez reçu cet e-mail car vous êtes abonné(e) à {topic}.',
  topic_button: 'Se désabonner de {topic}',
  topics_heading: 'Vos thèmes',
  no_topics: 'Cet expéditeur n’a encore configuré aucun thème.',
  state_subscribed: 'Abonné(e)',
  state_not_subscribed: 'Non abonné(e)',
  state_unsubscribed: 'Désabonné(e)',
  state_paused: 'Suspendu par l’expéditeur',
  action_unsubscribe: 'Se désabonner',
  action_resubscribe: 'Se réabonner',
  action_for_topic: 'de {topic}',
  action_to_topic: 'à {topic}',
  all_heading: 'Tous les e-mails',
  all_text: 'Ne plus recevoir aucun e-mail de {workspace}, quel que soit le thème.',
  all_button: 'Se désabonner de tout',
  all_blocked_text: 'Vous êtes désabonné(e) de tous les e-mails de {workspace}.',
  all_resubscribe_button: 'Se réabonner à tout',
  done_unsubscribed_title: 'Vous êtes désabonné(e)',
  done_unsubscribed_topic: 'Vous ne recevrez plus d’e-mails sur {topic} de la part de {workspace}.',
  done_unsubscribed_all: 'Vous ne recevrez plus aucun e-mail de {workspace}.',
  done_resubscribed_title: 'Vous êtes de nouveau abonné(e)',
  done_resubscribed_topic: 'Vous recevrez de nouveau des e-mails sur {topic} de la part de {workspace}.',
  done_resubscribed_all: 'Les e-mails de {workspace} peuvent de nouveau vous parvenir.',
  undo_prompt: 'Vous avez changé d’avis ?',
  undo_resubscribe: 'Se réabonner',
  undo_unsubscribe: 'Se désabonner à nouveau',
  test_banner: 'Ceci est un aperçu issu d’un e-mail de test. Rien de ce que vous faites ici ne modifie un abonnement.',
  test_done: 'Aperçu uniquement : rien n’a été modifié.',
  gone_title: 'Rien à modifier',
  gone_text:
    'Cette adresse ne figure plus sur la liste de cet expéditeur : ce lien ne donnera lieu à aucun autre e-mail.',
  invalid_title: 'Ce lien ne fonctionne pas',
  invalid_text:
    'Le lien est peut-être incomplet ou endommagé. Veuillez l’ouvrir à nouveau depuis l’e-mail, ou copier l’adresse complète dans votre navigateur.',
  cross_site_title: 'Demande refusée',
  cross_site_text:
    'Cette demande provient d’un autre site web et n’a pas été appliquée. Veuillez utiliser le lien figurant dans l’e-mail.',
  error_title: 'Un problème est survenu',
  error_text: 'Votre choix n’a pas été enregistré. Veuillez réessayer dans un instant.',
  footer: 'Cette page gère les e-mails que {workspace} vous envoie. Elle n’utilise ni cookies ni suivi.',
};

const es: Messages = {
  lang_name: 'Español',
  language_label: 'Idioma',
  doc_title: 'Preferencias de correo: {workspace}',
  manage_title: 'Preferencias de correo',
  manage_lead: 'Elija qué correos desea recibir de {workspace}.',
  address_line: 'Ajustes para {email}',
  topic_intro: 'Ha recibido este correo porque está suscrito/a a {topic}.',
  topic_button: 'Cancelar la suscripción a {topic}',
  topics_heading: 'Sus temas',
  no_topics: 'Este remitente aún no ha configurado ningún tema.',
  state_subscribed: 'Suscrito/a',
  state_not_subscribed: 'No suscrito/a',
  state_unsubscribed: 'Suscripción cancelada',
  state_paused: 'Pausado por el remitente',
  action_unsubscribe: 'Cancelar la suscripción',
  action_resubscribe: 'Volver a suscribirse',
  action_for_topic: 'a {topic}',
  action_to_topic: 'a {topic}',
  all_heading: 'Todos los correos',
  all_text: 'Dejar de recibir cualquier correo de {workspace}, sea cual sea el tema.',
  all_button: 'Cancelar todas las suscripciones',
  all_blocked_text: 'Ha cancelado la suscripción a todos los correos de {workspace}.',
  all_resubscribe_button: 'Volver a suscribirse a todo',
  done_unsubscribed_title: 'Suscripción cancelada',
  done_unsubscribed_topic: 'Ya no recibirá correos sobre {topic} de {workspace}.',
  done_unsubscribed_all: 'Ya no recibirá ningún correo de {workspace}.',
  done_resubscribed_title: 'Vuelve a estar suscrito/a',
  done_resubscribed_topic: 'Volverá a recibir correos sobre {topic} de {workspace}.',
  done_resubscribed_all: 'Los correos de {workspace} pueden volver a llegarle.',
  undo_prompt: '¿Ha cambiado de opinión?',
  undo_resubscribe: 'Volver a suscribirse',
  undo_unsubscribe: 'Cancelar la suscripción de nuevo',
  test_banner: 'Esta es una vista previa de un correo de prueba. Nada de lo que haga aquí modifica una suscripción.',
  test_done: 'Solo vista previa: no se ha modificado nada.',
  gone_title: 'Nada que cambiar',
  gone_text:
    'Esta dirección ya no figura en la lista de este remitente, por lo que este enlace no dará lugar a más correos.',
  invalid_title: 'Este enlace no funciona',
  invalid_text:
    'Puede que el enlace esté incompleto o dañado. Ábralo de nuevo desde el correo o copie la dirección completa en su navegador.',
  cross_site_title: 'Solicitud no aceptada',
  cross_site_text: 'Esta solicitud procede de otro sitio web y no se ha aplicado. Utilice el enlace del correo.',
  error_title: 'Algo ha salido mal',
  error_text: 'Su elección no se ha guardado. Vuelva a intentarlo en un momento.',
  footer: 'Esta página gestiona los correos que {workspace} le envía. No utiliza cookies ni seguimiento.',
};

export const MESSAGES: Readonly<Record<PageLocale, Messages>> = { en, de, it, fr, es };

export function isPageLocale(value: unknown): value is PageLocale {
  return typeof value === 'string' && (PAGE_LOCALES as readonly string[]).includes(value);
}

/** The primary subtag, lowercased: "de-AT" is "de". */
function primary(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * The languages this workspace's page is offered in: its configured locales that
 * the page has a translation for, in the workspace's order, default first. A
 * workspace that lists none of them (say only "pt") still gets English, so the
 * page always renders.
 */
export function offeredLocales(settings: { default_locale: string; locales: readonly string[] }): PageLocale[] {
  const out: PageLocale[] = [];
  for (const tag of [settings.default_locale, ...settings.locales]) {
    const p = primary(tag);
    if (isPageLocale(p) && !out.includes(p)) out.push(p);
  }
  return out.length > 0 ? out : ['en'];
}

/** Parses Accept-Language into primary subtags by descending quality, ignoring q=0. */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .slice(0, 512)
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
      const quality = q === undefined ? 1 : Number(q);
      return { tag: primary(tag), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((e) => e.tag && e.tag !== '*' && e.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((e) => e.tag);
}

/**
 * Picks the page language, first match wins among the offered ones:
 * 1. an explicit choice (`?lang=` or the form's `lang`, from the language switch),
 * 2. the browser's Accept-Language,
 * 3. the contact's stored locale (what their mail was most likely written in),
 * 4. the workspace's default, which `offeredLocales` puts first.
 */
export function chooseLocale(input: {
  offered: readonly PageLocale[];
  explicit?: string | null;
  acceptLanguage?: string;
  contactLocale?: string | null;
}): PageLocale {
  const { offered } = input;
  const pick = (tag: string | null | undefined) => {
    if (!tag) return undefined;
    const p = primary(tag);
    return offered.find((l) => l === p);
  };
  return (
    pick(input.explicit) ??
    parseAcceptLanguage(input.acceptLanguage).map(pick).find((l) => l !== undefined) ??
    pick(input.contactLocale) ??
    offered[0]!
  );
}
