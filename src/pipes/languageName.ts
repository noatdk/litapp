import { Pipe, PipeTransform } from '@angular/core';

// ISO 639-1 short-code → human-readable name. Covers every language Literotica
// publishes content in (and a few near-neighbours). Unknown codes pass through
// uppercased so the UI shows something other than a blank cell.
const LANGUAGE_NAMES: { [code: string]: string } = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  nl: 'Dutch',
  ru: 'Russian',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  hu: 'Hungarian',
  ro: 'Romanian',
  bg: 'Bulgarian',
  el: 'Greek',
  tr: 'Turkish',
  he: 'Hebrew',
  ar: 'Arabic',
  hi: 'Hindi',
  bn: 'Bengali',
  ur: 'Urdu',
  fa: 'Persian',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  fil: 'Filipino',
  tl: 'Tagalog',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  'zh-cmn-hans': 'Chinese (Simplified)',
  'zh-cmn-hant': 'Chinese (Traditional)',
  uk: 'Ukrainian',
  hr: 'Croatian',
  sr: 'Serbian',
  sl: 'Slovenian',
  ca: 'Catalan',
  gl: 'Galician',
  eu: 'Basque',
  is: 'Icelandic',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
};

@Pipe({ name: 'languageName' })
export class LanguageNamePipe implements PipeTransform {
  transform(code: any): string {
    if (!code) return '';
    const key = String(code).toLowerCase().trim();
    return LANGUAGE_NAMES[key] || key.toUpperCase();
  }
}
