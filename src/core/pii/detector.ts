import { env, pipeline } from '@xenova/transformers';
import type { Detection, DetectionSource, ExtractedPdf, ExtractedPage, PiiType } from '../../types/domain';
import { REGEX_PATTERNS } from './patterns';

interface NERToken {
  entity: string;
  entity_group?: string;
  score: number;
  start: number;
  end: number;
  word: string;
}

interface LocalNerEntity {
  label?: string;
  text?: string;
  start?: number | null;
  end?: number | null;
  score?: number;
}

interface LocalNerResponse {
  ok: boolean;
  entities?: LocalNerEntity[];
  error?: string;
}

interface ContextRule {
  type: PiiType;
  pattern: RegExp;
  valueGroup: number;
}

interface LayoutLabelRule {
  type: PiiType;
  labels: string[];
}

interface AddressSectionLabel {
  kind: 'recipient' | 'business';
  labels: string[];
}

interface LineRange {
  text: string;
  start: number;
  end: number;
}

const REQUIRED_LOCAL_NER_ASSETS = ['config.json', 'tokenizer.json', 'tokenizer_config.json'] as const;
const ADDRESS_SECTION_LABELS: AddressSectionLabel[] = [
  { kind: 'recipient', labels: ['rechnungsadresse', 'lieferadresse', 'billingaddress', 'shippingaddress', 'deliveryaddress'] },
  { kind: 'business', labels: ['verkauftdurch', 'soldby', 'halter', 'standort', 'location'] },
];
const BUSINESS_CONTEXT_HINTS = [
  'verkauft durch',
  'sold by',
  'in kooperation mit',
  'shop apotheke',
  'registrierte adresse',
  'registered address',
  'impressum',
  'weber e. k.',
  'standort',
  'location',
  'mietbeginn',
  'pickup location',
  'erwartete rückgabe',
  'erwartete rueckgabe',
  'return location',
  'halter',
  'owner',
  'enterprise autovermietung',
  'enterprise rent-a-car',
  'adac',
  'coverage',
  'tankgebühr',
  'tankgebuehr',
  'ladgebühr',
  'ladgebuehr',
  'kraftstoff',
  'mehrwertsteuer',
  'steuern und gebühren',
  'steuern und gebuehren',
  'geschätzte gesamtgebühren',
  'geschaetzte gesamtgebuehren',
  'autorisieren',
  'tagespreis',
  'stundenpreis',
  'auslandsaufenthalt',
  'voraussichtliche mietkosten',
  'kostenübersicht',
  'kostenuebersicht',
  'fahrzeug',
  'kennzeichen',
] as const;
const NON_PII_PERSON_TOKENS = new Set([
  'absicherungen',
  'abgelehnte',
  'anhang',
  'anspruch',
  'ergaenzungen',
  'ergänzungen',
  'erwartete',
  'fahrer',
  'fahrzeug',
  'folgendes',
  'fuer',
  'für',
  'gebuehr',
  'gebühr',
  'gewuenschte',
  'gewünschte',
  'hilfe',
  'kennzeichen',
  'km',
  'kosten',
  'kostenlos',
  'kraftstoff',
  'line',
  'lokale',
  'mietkosten',
  'moegliche',
  'mögliche',
  'ohne',
  'optionale',
  'pannenhilfe',
  'personal',
  'rechnungsstellung',
  'registrierte',
  'selbstbeteiligung',
  'satz',
  'section',
  'service',
  'shop',
  'und',
  'voraussichtliche',
  'zeit',
  'zusatzkosten',
]);
const AGGRESSIVE_LINE_LABEL_HINTS =
  /\b(?:vorname|familienname|nachname|name|empf[aä]nger|mieter|adresse|telefon|phone|e-?mail|iban|kontoinhaber|patient(?:en)?-?id|versicherung(?:snummer)?|ahv|avs)\b/i;
const AGGRESSIVE_LINE_SALUTATION_HINTS =
  /\b(?:frau\/herr|frau|herr|mr\.?|mrs\.?|ms\.?|monsieur|madame|señor(?:a)?|signor(?:a)?|sehr geehrte(?:r)?)/i;
const BUSINESS_ENTITY_HINTS = /\b(apotheke|enterprise|hospital|shop|gmbh|mbh|kg|ag|bv|co\.?kg|deutschland)\b/i;

function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl || baseUrl === '.') return '/';
  const withLeadingSlash = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function getLocalModelBasePath(): string {
  const baseUrl = normalizeBaseUrl(import.meta.env.BASE_URL);
  if (typeof window === 'undefined' || !window.location?.origin) {
    return `${baseUrl}models/`;
  }
  return new URL(`.${baseUrl}models/`, window.location.origin).toString();
}

async function clearTransformersBrowserCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete('transformers-cache');
  } catch {
    // Ignore cache API failures and continue with direct fetches.
  }
}

async function assertLocalModelAssetsAvailable(modelId: string): Promise<void> {
  const basePath = getLocalModelBasePath();

  for (const file of REQUIRED_LOCAL_NER_ASSETS) {
    const assetUrl = new URL(`${modelId}/${file}`, basePath).toString();
    const response = await fetch(assetUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Missing local model asset: ${assetUrl} (HTTP ${response.status})`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      throw new Error(`Invalid local model asset response at ${assetUrl} (received HTML instead of JSON)`);
    }
  }
}

const NON_PII_FINANCIAL_LINE_HINTS = [
  'rechnungs-nr',
  'rechnungsnr',
  'rechnungsdatum',
  'leistungsdatum',
  'fälligkeitsdatum',
  'position',
  'anzahl',
  'preis',
  'rabatt',
  'steuer',
  'gesamt',
  'nettobetrag',
  'rechnungsbetrag',
  'subtotal',
  'total due',
  'invoice no',
  'invoice date',
  'amount',
];

export interface DetectionOptions {
  minConfidence?: number;
  useRegex?: boolean;
  useNER?: boolean;
  aggressiveLineMode?: boolean;
  nerModel?: 'bert-base' | 'distilbert';
  useLocalNerService?: boolean;
}

let detectorId = 0;

function nextDetectionId() {
  detectorId += 1;
  return `det-${detectorId.toString().padStart(4, '0')}`;
}

function normalizeType(rawType: string): PiiType | null {
  const map: Record<string, PiiType> = {
    PER: 'PERSON',
    PERSON: 'PERSON',
    LOC: 'ADDRESS',
    LOCATION: 'ADDRESS',
    ORG: 'ID_NUMBER',
  };
  return map[rawType] ?? null;
}

function normalizeLocalLabel(rawLabel: string): PiiType | null {
  const normalized = rawLabel.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, PiiType> = {
    person: 'PERSON',
    name: 'PERSON',
    full_name: 'PERSON',
    first_name: 'PERSON',
    last_name: 'PERSON',
    surname: 'PERSON',
    address: 'ADDRESS',
    street_address: 'ADDRESS',
    location: 'ADDRESS',
    city: 'ADDRESS',
    email: 'EMAIL',
    email_address: 'EMAIL',
    phone: 'PHONE',
    phone_number: 'PHONE',
    mobile_phone: 'PHONE',
    iban: 'IBAN',
    bank_account: 'IBAN',
    id_number: 'ID_NUMBER',
    national_id: 'ID_NUMBER',
    passport: 'ID_NUMBER',
    passport_number: 'ID_NUMBER',
    ssn: 'ID_NUMBER',
    date_of_birth: 'DATE_OF_BIRTH',
    dob: 'DATE_OF_BIRTH',
    insurance_number: 'INSURANCE_NUMBER',
    policy_number: 'INSURANCE_NUMBER',
    patient_id: 'PATIENT_ID',
    avs_number: 'AVS_NUMBER',
    ahv_number: 'AVS_NUMBER',
    avs: 'AVS_NUMBER',
    ahv: 'AVS_NUMBER',
  };
  return map[normalized] ?? null;
}

const CONTEXT_RULES: ContextRule[] = [
  {
    type: 'DATE_OF_BIRTH',
    pattern:
      /\b(geburtsdatum|date of birth|dob|fecha de nacimiento|date de naissance|data di nascita)\b\s*[:-]?\s*((?:[0-3]?\d[./-][01]?\d[./-](?:19|20)?\d{2})|(?:(?:19|20)\d{2}-\d{2}-\d{2}))/giu,
    valueGroup: 2,
  },
  {
    type: 'PERSON',
    pattern: /\b(vorname(?:n)?|first name|nombre|pr[eé]nom|nome)\b\s*[:-]?\s*([A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30})/giu,
    valueGroup: 2,
  },
  {
    type: 'PERSON',
    pattern:
      /\b(name|patient|recipient|insured person|mieter|tenant|nombre(?: completo)?|nom(?: complet)?|nome(?: completo)?)\b\s*[:-]?\s*([A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}){1,2})/giu,
    valueGroup: 2,
  },
  {
    type: 'PERSON',
    pattern:
      /\b(empf[aä]nger|recipient|kontoinhaber|account holder|titulaire du compte|intestatario)\b\s*[:-]?\s*((?:(?:dr|mr|mrs|ms|prof|frau|herr|monsieur|madame|señor(?:a)?|signor(?:a)?)\.?\s+)?[A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}(?:\s*,?\s*[A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}){1,4})/giu,
    valueGroup: 2,
  },
  {
    type: 'PERSON',
    pattern:
      /\b(familienname|nachname|surname|last name|geburtsname|apellido(?:s)?|nom de famille|cognome)\b\s*[:-]?\s*([A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30})?)(?=\s+(?:geburtsort|place of birth|lugar de nacimiento|lieu de naissance|luogo di nascita|date|dob|geburtsdatum|fecha de nacimiento|date de naissance|data di nascita|patient|ahv|avs|telefon|phone|tel[eé]fono|t[eé]l[eé]phone|telefono|e-?mail|correo|courriel|iban)\b|$)/giu,
    valueGroup: 2,
  },
  {
    type: 'PERSON',
    pattern:
      /\b(?:frau\/herr|frau|herr|mr\.?|mrs\.?|ms\.?|monsieur|madame|señor(?:a)?|signor(?:a)?)\b\s+([A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,30}){0,2})/giu,
    valueGroup: 1,
  },
  {
    type: 'ADDRESS',
    pattern:
      /\b(geburtsort|place of birth|lugar de nacimiento|lieu de naissance|luogo di nascita)\b\s*[:-]?\s*([A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,40}(?:\s+[A-ZÀ-ÖØ-Ý][\p{L}'’-]{1,40})?)/giu,
    valueGroup: 2,
  },
  {
    type: 'ADDRESS',
    pattern:
      /\b(address|adresse|direcci[oó]n|indirizzo)\b\s*[:-]?\s*([^\n]{6,120})/giu,
    valueGroup: 2,
  },
  {
    type: 'EMAIL',
    pattern:
      /\b(e-?mail|correo(?: electr[oó]nico)?|courriel|posta elettronica)\b\s*[:-]?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/giu,
    valueGroup: 2,
  },
  {
    type: 'PHONE',
    pattern:
      /\b(telefon|phone|tel\.?|tel[eé]fono|t[eé]l[eé]phone|telefono|contact|hotline|fax)\b\s*[:-]?\s*(\+?\d[\d\s()./-]{7,}\d)/giu,
    valueGroup: 2,
  },
  {
    type: 'IBAN',
    pattern: /\b(iban)\b\s*[:-]?\s*([A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30})/giu,
    valueGroup: 2,
  },
  {
    type: 'PATIENT_ID',
    pattern: /\b(patient(?:en)?-?id|patient id|id (?:del )?paciente|id patient)\b\s*[:-]?\s*([A-Z]{2,6}-?\d{4,12})/giu,
    valueGroup: 2,
  },
  {
    type: 'AVS_NUMBER',
    pattern:
      /\b(ahv|avs)\b(?:\s*(?:no\.?|nr\.?|number|nummer|num[eé]ro))?\s*[:-]?\s*(756[.\s]\d{4}[.\s]\d{4}[.\s]\d{2})/giu,
    valueGroup: 2,
  },
  {
    type: 'INSURANCE_NUMBER',
    pattern:
      /\b(versicherung(?:snummer)?|insurance number|policy no\.?|n[uú]mero de seguro|num[eé]ro d[' ]assurance|numero di assicurazione)\b\s*[:-]?\s*([A-Z]{1,4}-[A-Z]{2}-\d{3}-\d{3}-\d{3}|[A-Z]{1,4}-?\d{6,})/giu,
    valueGroup: 2,
  },
];

const LAYOUT_LABEL_RULES: LayoutLabelRule[] = [
  { type: 'DATE_OF_BIRTH', labels: ['geburtsdatum', 'dateofbirth', 'dob', 'fechadenacimiento', 'datedenaissance', 'datadinascita'] },
  { type: 'PERSON', labels: ['vorname', 'vornamen', 'firstname', 'nombre', 'prenom', 'nome'] },
  { type: 'PERSON', labels: ['familienname', 'nachname', 'surname', 'lastname', 'geburtsname', 'apellido', 'apellidos', 'nomdefamille', 'cognome'] },
  { type: 'PERSON', labels: ['empfanger', 'empfaenger', 'recipient', 'kontoinhaber', 'accountholder', 'titulaireducompte', 'intestatario', 'mieter', 'tenant'] },
  { type: 'ADDRESS', labels: ['geburtsort', 'placeofbirth', 'lugardenacimiento', 'lieudenaissance', 'luogodinascita', 'address', 'adresse', 'billingaddress', 'shippingaddress', 'deliveryaddress', 'rechnungsadresse', 'lieferadresse'] },
  { type: 'PHONE', labels: ['telefon', 'phone', 'tel', 'telefono', 'telephone', 'hotline', 'fax'] },
  { type: 'EMAIL', labels: ['email', 'correo', 'correoelectronico', 'courriel', 'postaelettronica'] },
  { type: 'IBAN', labels: ['iban'] },
  { type: 'PATIENT_ID', labels: ['patientid', 'patientenid', 'idpaciente'] },
  { type: 'AVS_NUMBER', labels: ['ahv', 'avs', 'ahvno', 'avsno', 'ahvnummer', 'avsnummer'] },
  { type: 'INSURANCE_NUMBER', labels: ['insurance', 'insurancenumber', 'policyno', 'versicherung', 'versicherungsnummer', 'numerodeseguro', 'numerodassurance'] },
];

function mapMatchToDetection(page: ExtractedPage, type: PiiType, matchText: string, start: number, end: number, source: DetectionSource, confidence: number): Detection {
  const overlapping = page.spans.filter((span) => span.start < end && span.end > start);
  const normalizedMatch = matchText.toLowerCase().replace(/\s+/g, ' ').trim();
  const fallbackItems =
    overlapping.length > 0
      ? overlapping.map((entry) => entry.item)
      : page.items.filter((item) => {
          const itemText = item.text.toLowerCase().replace(/\s+/g, ' ').trim();
          if (!itemText) return false;
          if (itemText.includes(normalizedMatch) || normalizedMatch.includes(itemText)) return true;

          const matchTokens = normalizedMatch.split(' ').filter((token) => token.length > 2);
          return matchTokens.some((token) => itemText.includes(token));
        });

  const segments = fallbackItems.map((item) => {
    // pdf.js text `y` is close to baseline; translate to a glyph-covering box.
    const effectiveHeight = Math.max(item.height, 8);
    return {
      x: item.x,
      y: item.y - effectiveHeight * 0.22,
      width: Math.max(item.width, 8),
      height: Math.max(effectiveHeight * 1.08, 10),
    };
  });

  const bbox = segments.length
    ? {
        x: Math.min(...segments.map((segment) => segment.x)),
        y: Math.min(...segments.map((segment) => segment.y)),
        width:
          Math.max(...segments.map((segment) => segment.x + segment.width)) -
          Math.min(...segments.map((segment) => segment.x)),
        height:
          Math.max(...segments.map((segment) => segment.y + segment.height)) -
          Math.min(...segments.map((segment) => segment.y)),
      }
    : { x: 0, y: 0, width: 0, height: 0 };

  return {
    id: nextDetectionId(),
    type,
    text: matchText,
    page: page.page,
    bbox,
    segments,
    start,
    end,
    confidence,
    source,
  };
}

function deduplicateDetections(detections: Detection[]): Detection[] {
  const byKey = new Map<string, Detection>();

  detections.forEach((detection) => {
    const normalizedText = normalizeDetectionTextForType(detection.type, detection.text);
    const key = `${detection.page}|${detection.type}|${detection.start}|${detection.end}|${normalizedText}`;
    const existing = byKey.get(key);

    if (!existing || detection.confidence > existing.confidence) {
      byKey.set(key, detection);
    }
  });
  return Array.from(byKey.values()).sort((a, b) => a.page - b.page || (a.start ?? 0) - (b.start ?? 0));
}

function normalizeDetectionTextForType(type: PiiType, text: string): string {
  if (type === 'PHONE' || type === 'IBAN' || type === 'AVS_NUMBER' || type === 'ID_NUMBER') {
    return text.replace(/\s+/g, '').replace(/[()./-]/g, '').toLowerCase();
  }
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function detectWithContext(page: ExtractedPage): Detection[] {
  const detections: Detection[] = [];

  CONTEXT_RULES.forEach((rule) => {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null = regex.exec(page.text);

    while (match) {
      const value = match[rule.valueGroup];
      if (value) {
        const offsetInMatch = match[0].indexOf(value);
        if (offsetInMatch >= 0) {
          const start = match.index + offsetInMatch;
          const end = start + value.length;
          detections.push(mapMatchToDetection(page, rule.type, value, start, end, 'context', 0.98));
        }
      }
      match = regex.exec(page.text);
    }
  });

  return detections;
}

function normalizeLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isLikelyLabelToken(text: string): boolean {
  const normalized = normalizeLabel(text);
  return LAYOUT_LABEL_RULES.some((rule) => rule.labels.some((label) => normalized.includes(label)));
}

function isLikelyEmail(text: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u.test(text.trim());
}

function hasBusinessContext(pageText: string, start: number, end: number): boolean {
  const left = Math.max(0, start - 72);
  const right = Math.min(pageText.length, end + 72);
  const window = pageText.slice(left, right).toLowerCase();
  return BUSINESS_CONTEXT_HINTS.some((hint) => window.includes(hint));
}

function hasPersonFieldContext(pageText: string, start: number, end: number): boolean {
  const left = Math.max(0, start - 48);
  const right = Math.min(pageText.length, end + 24);
  const window = pageText.slice(left, right).toLowerCase();
  return /\b(vorname|familienname|nachname|name|patient|empf[aä]nger|recipient|kontoinhaber|account holder|mieter|tenant|nombre|apellido|prenom|nom de famille|cognome|rechnungsadresse|lieferadresse|billing address|shipping address)\b/.test(window);
}

function hasAddressFieldContext(pageText: string, start: number, end: number): boolean {
  const left = Math.max(0, start - 48);
  const right = Math.min(pageText.length, end + 24);
  const window = pageText.slice(left, right).toLowerCase();
  return /\b(address|adresse|direcci[oó]n|indirizzo|geburtsort|place of birth|lugar de nacimiento|lieu de naissance|luogo di nascita|rechnungsadresse|lieferadresse|billing address|shipping address)\b/.test(window);
}

function hasBusinessAddressContext(pageText: string, start: number, end: number): boolean {
  const left = Math.max(0, start - 72);
  const right = Math.min(pageText.length, end + 48);
  const window = pageText.slice(left, right).toLowerCase();
  return /\b(registrierte adresse|registered address|verkauft durch|sold by|standort|location|mietbeginn|pickup location|erwartete rückgabe|erwartete rueckgabe|return location|halter|owner)\b/.test(window);
}

function hasAdjacentRecipientBlock(pageText: string, start: number, end: number, type: 'PERSON' | 'ADDRESS'): boolean {
  const lines = splitLinesWithRanges(pageText);
  const currentIndex = lines.findIndex((line) => start >= line.start && end <= line.end);
  if (currentIndex < 0) return false;

  const current = lines[currentIndex]?.text ?? '';
  const prev = lines[currentIndex - 1]?.text ?? '';
  const next = lines[currentIndex + 1]?.text ?? '';
  const next2 = lines[currentIndex + 2]?.text ?? '';

  if (type === 'PERSON') {
    if (BUSINESS_ENTITY_HINTS.test(current)) return false;
    return isLikelyStreetLine(next) || isLikelyStreetLine(next2) || isLikelyStreetLine(prev);
  }

  return (
    isLikelyStandaloneNameLine(prev) ||
    isLikelyStandaloneNameLine(next) ||
    isLikelyPostalCityLine(prev) ||
    isLikelyPostalCityLine(next) ||
    isLikelyPostalCityLine(next2)
  );
}

function hasBusinessSectionLabelNearby(page: ExtractedPage, detection: Detection): boolean {
  const x = detection.bbox.x;
  const y = detection.bbox.y;

  return page.items.some((item) => {
    const text = item.text.trim();
    if (!text) return false;
    const normalized = normalizeLabel(text);
    const isBusinessLabel = ADDRESS_SECTION_LABELS
      .filter((rule) => rule.kind === 'business')
      .some((rule) => rule.labels.some((label) => normalized.includes(label)));

    if (!isBusinessLabel) return false;
    if (Math.abs(item.x - x) > 40) return false;
    if (item.y <= y) return false;
    if (item.y - y > 26) return false;
    return true;
  });
}

function hasRecipientBlockGeometry(page: ExtractedPage, detection: Detection, type: 'PERSON' | 'ADDRESS'): boolean {
  const x = detection.bbox.x;
  const y = detection.bbox.y;

  const aligned = page.items
    .filter((item) => item.text.trim().length > 0)
    .filter((item) => Math.abs(item.x - x) <= 28)
    .filter((item) => Math.abs(item.y - y) <= 42)
    .map((item) => item.text.trim());

  if (type === 'PERSON') {
    return aligned.some((text) => isLikelyStreetLine(text)) && aligned.some((text) => isLikelyPostalCityLine(text));
  }

  return aligned.some((text) => isLikelyPersonContextValue(text)) && aligned.some((text) => isLikelyPostalCityLine(text) || isLikelyStreetLine(text));
}

function isPlausibleContextValue(type: PiiType, text: string): boolean {
  if (type === 'EMAIL') return isLikelyEmail(text);
  if (type === 'PHONE') return isLikelyPhone(text);
  if (type === 'IBAN') return isLikelyIban(text);
  if (type === 'ADDRESS') return isLikelyAddressContextValue(text);
  if (type === 'PERSON') return isLikelyPersonContextValue(text);
  return text.trim().length > 1;
}

function resolveRuleForLabel(labelText: string): LayoutLabelRule | null {
  const normalized = normalizeLabel(labelText);
  for (const rule of LAYOUT_LABEL_RULES) {
    if (rule.labels.some((label) => normalized.includes(label))) {
      return rule;
    }
  }
  return null;
}

function resolveAddressSectionLabel(labelText: string): AddressSectionLabel | null {
  const normalized = normalizeLabel(labelText);
  for (const rule of ADDRESS_SECTION_LABELS) {
    if (rule.labels.some((label) => normalized.includes(label))) {
      return rule;
    }
  }
  return null;
}

function extractInlineValueFromLabelText(labelText: string, labels: string[]): string | null {
  const raw = labelText.trim();
  if (!raw) return null;

  for (const label of labels) {
    const pattern = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b\\s*[:\\-]?\\s*(.+)$`, 'iu');
    const match = pattern.exec(raw);
    if (!match) continue;
    const value = match[1]?.trim();
    if (!value || value.length < 2) continue;
    return value;
  }

  return null;
}

function detectWithLayoutContext(page: ExtractedPage): Detection[] {
  const detections: Detection[] = [];

  for (const labelItem of page.items) {
    const rule = resolveRuleForLabel(labelItem.text);
    if (!rule) continue;

    // Some PDFs combine label and value in one text item: "Familienname Max Mustermann"
    const inlineValue = extractInlineValueFromLabelText(labelItem.text, rule.labels);
    if (inlineValue && isPlausibleContextValue(rule.type, inlineValue)) {
      const itemSpan = page.spans.find((span) => span.item === labelItem);
      if (itemSpan) {
        const baseText = labelItem.text;
        const inlineStartInItem = baseText.toLowerCase().indexOf(inlineValue.toLowerCase());
        if (inlineStartInItem >= 0) {
          const start = itemSpan.start + inlineStartInItem;
          const end = start + inlineValue.length;
          detections.push(mapMatchToDetection(page, rule.type, inlineValue, start, end, 'context', 0.99));
          continue;
        }
      }
    }

    const sameLineCandidates = page.items
      .filter((item) => item !== labelItem)
      .filter((item) => Math.abs(item.y - labelItem.y) <= Math.max(2, labelItem.height * 0.5))
      .filter((item) => item.x > labelItem.x + labelItem.width + 1)
      .sort((a, b) => a.x - b.x);

    const belowCandidates = page.items
      .filter((item) => item !== labelItem)
      .filter((item) => item.y < labelItem.y)
      .filter((item) => labelItem.y - item.y <= Math.max(26, labelItem.height * 2.8))
      .filter((item) => {
        const centerX = item.x + item.width / 2;
        return centerX >= labelItem.x - 4 && centerX <= labelItem.x + Math.max(labelItem.width * 2.4, 60);
      })
      .sort((a, b) => b.y - a.y);

    const valueItem =
      sameLineCandidates.find((item) => !isLikelyLabelToken(item.text.trim())) ??
      belowCandidates.find((item) => !isLikelyLabelToken(item.text.trim()));
    if (!valueItem) continue;

    const valueText = valueItem.text.trim();
    if (!valueText || valueText.length < 2) continue;
    if (!isPlausibleContextValue(rule.type, valueText)) continue;

    const valueSpan = page.spans.find((span) => span.item === valueItem);
    if (!valueSpan) continue;

    detections.push(
      mapMatchToDetection(
        page,
        rule.type,
        valueText,
        valueSpan.start,
        valueSpan.end,
        'context',
        0.99,
      ),
    );
  }

  return detections;
}

function detectLabeledAddressSections(page: ExtractedPage): Detection[] {
  const detections: Detection[] = [];

  for (const labelItem of page.items) {
    const section = resolveAddressSectionLabel(labelItem.text);
    if (!section || section.kind !== 'recipient') continue;

    const candidates = page.items
      .filter((item) => item !== labelItem)
      .filter((item) => item.text.trim().length > 0)
      .filter((item) => item.y < labelItem.y)
      .filter((item) => labelItem.y - item.y <= 90)
      .filter((item) => item.x >= labelItem.x - 8 && item.x <= labelItem.x + 220)
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines: typeof candidates = [];
    for (const item of candidates) {
      const text = item.text.trim();
      if (!text) continue;
      if (resolveRuleForLabel(text) || resolveAddressSectionLabel(text)) continue;
      if (lines.some((existing) => Math.abs(existing.y - item.y) <= Math.max(2, item.height * 0.4))) continue;
      lines.push(item);
      if (lines.length === 3) break;
    }

    const [nameItem, streetItem, cityItem] = lines;

    if (nameItem && isLikelyPersonContextValue(nameItem.text)) {
      const span = page.spans.find((entry) => entry.item === nameItem);
      const range = span ? { start: span.start, end: span.end } : findTextRange(page.text, nameItem.text.trim());
      if (range) {
        detections.push(mapMatchToDetection(page, 'PERSON', nameItem.text.trim(), range.start, range.end, 'context', 0.99));
      }
    }

    if (streetItem && isLikelyStreetLine(streetItem.text)) {
      const span = page.spans.find((entry) => entry.item === streetItem);
      const range = span ? { start: span.start, end: span.end } : findTextRange(page.text, streetItem.text.trim());
      if (range) {
        detections.push(mapMatchToDetection(page, 'ADDRESS', streetItem.text.trim(), range.start, range.end, 'context', 0.99));
      }
    }

    if (cityItem && isLikelyPostalCityLine(cityItem.text)) {
      const span = page.spans.find((entry) => entry.item === cityItem);
      const range = span ? { start: span.start, end: span.end } : findTextRange(page.text, cityItem.text.trim());
      if (range) {
        detections.push(mapMatchToDetection(page, 'ADDRESS', cityItem.text.trim(), range.start, range.end, 'context', 0.99));
      }
    }
  }

  return detections;
}

function splitLinesWithRanges(text: string): LineRange[] {
  const lines = text.split('\n');
  const ranges: LineRange[] = [];
  let cursor = 0;

  for (const line of lines) {
    const start = text.indexOf(line, cursor);
    const end = start + line.length;
    ranges.push({ text: line.trim(), start, end });
    cursor = end + 1;
  }

  return ranges.filter((entry) => entry.text.length > 0);
}

function findTextRange(text: string, needle: string): { start: number; end: number } | null {
  const normalizedNeedle = needle.trim();
  if (!normalizedNeedle) return null;

  const directStart = text.indexOf(normalizedNeedle);
  if (directStart >= 0) {
    return { start: directStart, end: directStart + normalizedNeedle.length };
  }

  const escaped = normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relaxedPattern = escaped.replace(/\s+/g, '\\s+');
  const regex = new RegExp(relaxedPattern, 'i');
  const match = regex.exec(text);
  if (!match) return null;

  return { start: match.index, end: match.index + match[0].length };
}

function isLikelyStreetLine(text: string): boolean {
  const cleaned = text.trim();
  if (!/\d/.test(cleaned)) return false;

  const streetWords =
    /(straße|strasse|str\.|street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd\.|weg|gasse|platz|allee|via|rue|chemin)/iu;

  return streetWords.test(cleaned);
}

function isLikelyPostalCityLine(text: string): boolean {
  const cleaned = text.trim();
  return /^\d{4,5}\s+[A-Za-zÀ-ÖØ-öø-ÿ.'’ -]{2,}(?:,\s?[A-Z]{2})?$/u.test(cleaned);
}

function isLikelyStandaloneNameLine(text: string): boolean {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  const normalized = cleaned
    .replace(/\b(?:dr|mr|mrs|ms|prof|frau|herr|monsieur|madame|señor(?:a)?|signor(?:a)?)\.?\s+/gi, '')
    .replace(/[,:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length < 5 || normalized.length > 70) return false;
  if (/\d/.test(normalized)) return false;

  const stopTokens = new Set([
    'apotheke',
    'enterprise',
    'deutschland',
    'fortuna',
    'shop',
    'kraftfahrt',
    'bundesamt',
    'hospital',
    'university',
    'department',
    'invoice',
    'insurance',
    'office',
    'notice',
    'document',
    'synthetic',
    'social',
  ]);

  const tokens = normalized.split(' ');
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (tokens.some((token) => stopTokens.has(token.toLowerCase()))) return false;
  if (tokens.some((token) => NON_PII_PERSON_TOKENS.has(token.toLowerCase()))) return false;
  if (tokens.some((token) => token.length > 18)) return false;
  if (tokens.filter((token) => token.length >= 4).length < 2) return false;
  if (NON_PII_FINANCIAL_LINE_HINTS.some((hint) => normalized.toLowerCase().includes(hint))) return false;

  return tokens.every((token) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’-]{1,30}$/u.test(token));
}

function detectStandaloneBlocks(page: ExtractedPage): Detection[] {
  const detections: Detection[] = [];
  const lines = splitLinesWithRanges(page.text);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isLikelyStandaloneNameLine(line.text)) continue;

    detections.push(
      mapMatchToDetection(page, 'PERSON', line.text, line.start, line.end, 'context', 0.94),
    );

    const line2 = lines[index + 1];
    if (line2 && isLikelyStreetLine(line2.text)) {
      detections.push(
        mapMatchToDetection(page, 'ADDRESS', line2.text, line2.start, line2.end, 'context', 0.93),
      );
    }

    const line3 = lines[index + 2];
    if (line3 && isLikelyPostalCityLine(line3.text)) {
      detections.push(
        mapMatchToDetection(page, 'ADDRESS', line3.text, line3.start, line3.end, 'context', 0.93),
      );
    }
  }

  // Fallback: detect using item geometry when page text lines are flattened.
  const textItems = page.items.filter((item) => item.text.trim().length > 0);
  for (const nameItem of textItems) {
    const nameText = nameItem.text.trim();
    if (!isLikelyStandaloneNameLine(nameText)) continue;

    const nameSpan = page.spans.find((span) => span.item === nameItem);
    const nameRange = nameSpan
      ? { start: nameSpan.start, end: nameSpan.end }
      : findTextRange(page.text, nameText);
    if (!nameRange) continue;

    detections.push(
      mapMatchToDetection(page, 'PERSON', nameText, nameRange.start, nameRange.end, 'context', 0.94),
    );

    const belowAligned = textItems
      .filter((item) => item !== nameItem)
      .filter((item) => item.y < nameItem.y)
      .filter((item) => nameItem.y - item.y <= 60)
      .filter((item) => Math.abs(item.x - nameItem.x) <= 28)
      .sort((a, b) => b.y - a.y);

    const streetItem = belowAligned.find((item) => isLikelyStreetLine(item.text));
    if (streetItem) {
      const streetSpan = page.spans.find((span) => span.item === streetItem);
      const streetRange = streetSpan
        ? { start: streetSpan.start, end: streetSpan.end }
        : findTextRange(page.text, streetItem.text.trim());
      if (streetRange) {
        detections.push(
          mapMatchToDetection(page, 'ADDRESS', streetItem.text.trim(), streetRange.start, streetRange.end, 'context', 0.93),
        );
      }
    }

    const cityItem = belowAligned.find((item) => isLikelyPostalCityLine(item.text));
    if (cityItem) {
      const citySpan = page.spans.find((span) => span.item === cityItem);
      const cityRange = citySpan
        ? { start: citySpan.start, end: citySpan.end }
        : findTextRange(page.text, cityItem.text.trim());
      if (cityRange) {
        detections.push(
          mapMatchToDetection(page, 'ADDRESS', cityItem.text.trim(), cityRange.start, cityRange.end, 'context', 0.93),
        );
      }
    }
  }

  return detections;
}

function detectHeaderRecipientBlocks(page: ExtractedPage): Detection[] {
  const detections: Detection[] = [];
  const textItems = page.items.filter((item) => item.text.trim().length > 0);

  for (const nameItem of textItems) {
    const nameText = nameItem.text.trim();
    if (!isLikelyPersonContextValue(nameText)) continue;
    if (BUSINESS_ENTITY_HINTS.test(nameText)) continue;

    const senderAbove = textItems.some((item) => {
      if (item === nameItem) return false;
      if (item.y <= nameItem.y) return false;
      if (item.y - nameItem.y > 28) return false;
      if (Math.abs(item.x - nameItem.x) > 24) return false;
      return BUSINESS_ENTITY_HINTS.test(item.text) || /·/.test(item.text);
    });
    if (!senderAbove) continue;

    const belowAligned = textItems
      .filter((item) => item !== nameItem)
      .filter((item) => item.y < nameItem.y)
      .filter((item) => nameItem.y - item.y <= 40)
      .filter((item) => Math.abs(item.x - nameItem.x) <= 24)
      .sort((a, b) => b.y - a.y);

    const streetItem = belowAligned.find((item) => isLikelyStreetLine(item.text));
    const cityItem = belowAligned.find((item) => isLikelyPostalCityLine(item.text));
    if (!streetItem || !cityItem) continue;

    const nameSpan = page.spans.find((span) => span.item === nameItem);
    if (nameSpan) {
      detections.push(mapMatchToDetection(page, 'PERSON', nameText, nameSpan.start, nameSpan.end, 'context', 0.95));
    }

    const streetSpan = page.spans.find((span) => span.item === streetItem);
    if (streetSpan) {
      detections.push(mapMatchToDetection(page, 'ADDRESS', streetItem.text.trim(), streetSpan.start, streetSpan.end, 'context', 0.95));
    }

    const citySpan = page.spans.find((span) => span.item === cityItem);
    if (citySpan) {
      detections.push(mapMatchToDetection(page, 'ADDRESS', cityItem.text.trim(), citySpan.start, citySpan.end, 'context', 0.95));
    }
  }

  return detections;
}

function expandToLineDetections(page: ExtractedPage, detections: Detection[]): Detection[] {
  const lines = splitLinesWithRanges(page.text);
  const expanded: Detection[] = [];

  for (const detection of detections) {
    if (detection.page !== page.page) continue;
    if (typeof detection.start !== 'number' || typeof detection.end !== 'number') continue;

    const line = lines.find((entry) => detection.start! >= entry.start && detection.end! <= entry.end);
    if (!line) continue;
    if (line.text.length < 4 || line.text.length > 180) continue;
    const lowered = line.text.toLowerCase();
    if (NON_PII_FINANCIAL_LINE_HINTS.some((hint) => lowered.includes(hint))) continue;
    if (!AGGRESSIVE_LINE_LABEL_HINTS.test(line.text) && !AGGRESSIVE_LINE_SALUTATION_HINTS.test(line.text)) continue;

    // Full-line expansion should focus on privacy-bearing fields, not generic dates/amount lines.
    if (!['PERSON', 'ADDRESS', 'EMAIL', 'PHONE', 'IBAN', 'PATIENT_ID', 'INSURANCE_NUMBER', 'AVS_NUMBER'].includes(detection.type)) {
      continue;
    }

    const coverage = (detection.end - detection.start) / Math.max(line.end - line.start, 1);
    if (coverage < 0.25 && !AGGRESSIVE_LINE_SALUTATION_HINTS.test(line.text)) continue;

    expanded.push(
      mapMatchToDetection(page, detection.type, line.text, line.start, line.end, 'context', Math.max(0.85, detection.confidence - 0.05)),
    );
  }

  return expanded;
}

function isLikelyPhone(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  const digitsOnly = compact.replace(/[^\d]/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;

  // Require explicit international prefix (+..) or local leading 0/00.
  const normalized = compact.replace(/[()-]/g, '');
  if (!(normalized.startsWith('+') || normalized.startsWith('0'))) return false;

  // Reject common date-like values that were split oddly by PDF extraction.
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(text.trim())) return false;
  if (/^\d{1,2}[./-]\d{4}(?:[./-]\d{1,2}[./-]\d{4})+$/.test(text.trim())) return false;
  if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(text.trim())) return false;
  if (/^\d+$/.test(text.trim())) return false;
  const separators = (text.match(/[.\s()-]/g) ?? []).length;
  if (separators < 2) return false;

  return true;
}

function isLikelyPerson(text: string): boolean {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  const normalized = cleaned
    .replace(/^[^:]{1,40}:\s*/u, '')
    .replace(/\b(?:dr|mr|mrs|ms|prof|frau|herr|monsieur|madame|señor(?:a)?|signor(?:a)?)\.?\s+/giu, '')
    .replace(/[,:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;

  const stopTokens = new Set([
    'hospital',
    'invoice',
    'department',
    'statement',
    'summary',
    'service',
    'services',
    'payment',
    'details',
    'policy',
    'claim',
    'document',
    'synthetic',
    'notice',
    'annex',
    'office',
    'provider',
    'support',
  ]);

  if (NON_PII_FINANCIAL_LINE_HINTS.some((hint) => normalized.toLowerCase().includes(hint))) return false;
  if (/\d/.test(normalized)) return false;

  const parts = normalized.split(' ');
  if (parts.length < 2 || parts.length > 4) return false;
  if (parts.some((part) => part.length < 2)) return false;
  if (parts.some((part) => stopTokens.has(part.toLowerCase()))) return false;
  if (!parts.every((part) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ.'’-]+$/u.test(part))) return false;

  return true;
}

function isLikelyPersonContextValue(text: string): boolean {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  const normalized = cleaned
    .replace(/\b(?:dr|mr|mrs|ms|prof|frau|herr|monsieur|madame|señor(?:a)?|signor(?:a)?)\.?\s+/giu, '')
    .replace(/[,:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (NON_PII_FINANCIAL_LINE_HINTS.some((hint) => normalized.toLowerCase().includes(hint))) return false;
  if (/\d/.test(normalized)) return false;
  if (BUSINESS_ENTITY_HINTS.test(normalized)) return false;

  const parts = normalized.split(' ');
  if (parts.length < 1 || parts.length > 4) return false;
  if (parts.some((part) => NON_PII_PERSON_TOKENS.has(part.toLowerCase()))) return false;
  if (parts.some((part) => part.length > 18)) return false;
  if (parts.length > 1 && parts.filter((part) => part.length >= 4).length < 2) return false;
  return parts.every((part) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ.'’-]{1,30}$/u.test(part));
}

function isLikelyAddress(text: string): boolean {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 6 || cleaned.length > 120) return false;
  const hasDigit = /\d/.test(cleaned);
  const hasLetter = /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(cleaned);
  if (!(hasDigit && hasLetter)) return false;

  const lowered = cleaned.toLowerCase();
  if (NON_PII_FINANCIAL_LINE_HINTS.some((hint) => lowered.includes(hint))) return false;
  if (/\b(position|anzahl|preis|rabatt|steuer|gesamt|rechnungsdatum|leistungsdatum|fälligkeitsdatum)\b/i.test(cleaned)) {
    return false;
  }

  return true;
}

function isLikelyAddressContextValue(text: string): boolean {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (isLikelyAddress(cleaned)) return true;
  const parts = cleaned.split(' ');
  if (parts.length > 3) return false;
  return parts.every((part) => /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ.'-]{1,40}$/.test(part));
}

function hasDobContext(pageText: string, start: number, end: number): boolean {
  const left = Math.max(0, start - 48);
  const right = Math.min(pageText.length, end + 48);
  const window = pageText.slice(left, right).toLowerCase();
  return /(geburtsdatum|date of birth|dob|fecha de nacimiento|date de naissance|data di nascita)/.test(window);
}

function isLikelyIdNumber(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 6) return false;
  if (/^\d{1,5}$/.test(cleaned)) return false;
  return /[A-Za-z]/.test(cleaned) || /\d{6,}/.test(cleaned);
}

function isLikelyIban(text: string): boolean {
  const compact = text.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;
  if (compact.length < 15 || compact.length > 34) return false;
  if (!/^(AD|AE|AL|AT|AZ|BA|BE|BG|BH|BI|BR|BY|CH|CR|CY|CZ|DE|DK|DO|EE|EG|ES|FI|FO|FR|GB|GE|GI|GL|GR|GT|HR|HU|IE|IL|IQ|IS|IT|JO|KW|KZ|LB|LC|LI|LT|LU|LV|MC|MD|ME|MK|MR|MT|MU|NL|NO|PK|PL|PS|PT|QA|RO|RS|SA|SC|SE|SI|SK|SM|ST|SV|TL|TN|TR|UA|VA|VG|XK)/.test(compact)) {
    return false;
  }
  return true;
}

export class PIIDetector {
  private model: ((text: string) => Promise<NERToken[]>) | null = null;
  private lastNerError: string | null = null;
  private activeNerModelId: string | null = null;

  getLastNerError(): string | null {
    return this.lastNerError;
  }

  getActiveNerModelId(): string | null {
    return this.activeNerModelId;
  }

  private getNerCandidates(preferred: 'bert-base' | 'distilbert' = 'bert-base'): string[] {
    // Keep one known-good public Xenova model to avoid invalid repo fallbacks.
    // 'Xenova/distilbert-NER' is not consistently available.
    if (preferred === 'distilbert') {
      return ['Xenova/bert-base-NER'];
    }
    return ['Xenova/bert-base-NER'];
  }

  async initializeNER(preferred: 'bert-base' | 'distilbert' = 'bert-base') {
    if (this.model) return;

    // Enforce locally hosted Xenova model files under public/models.
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    const errors: string[] = [];
    const candidates = this.getNerCandidates(preferred);

    for (const modelId of candidates) {
      try {
        await clearTransformersBrowserCache();
        await assertLocalModelAssetsAvailable(modelId);
        env.localModelPath = getLocalModelBasePath();
        const nerPipeline = await pipeline('token-classification', modelId);
        this.activeNerModelId = modelId;
        this.model = async (text: string) =>
          ((nerPipeline as unknown as (input: string, options?: Record<string, unknown>) => Promise<NERToken[]>)(
            text,
            { aggregation_strategy: 'simple' },
          ) as Promise<NERToken[]>);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${modelId}: ${message}`);
      }
    }

    throw new Error(`Unable to load local NER model from /models. Run: npm run ner:download. ${errors.join(' | ')}`);
  }

  private async detectViaLocalNerService(
    text: string,
    minConfidence: number,
  ): Promise<Array<{ type: PiiType; start: number; end: number; score: number }>> {
    const response = await fetch('http://127.0.0.1:8787/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        threshold: minConfidence,
        candidate_labels: [
          'name',
          'full_name',
          'address',
          'email',
          'phone',
          'iban',
          'id_number',
          'date_of_birth',
          'insurance_number',
          'patient_id',
          'avs_number',
          'ahv_number',
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Local NER HTTP ${response.status}`);
    }

    const payload = (await response.json()) as LocalNerResponse;
    if (!payload.ok) {
      throw new Error(payload.error ?? 'Local NER returned error');
    }

    const entities = payload.entities ?? [];
    const out: Array<{ type: PiiType; start: number; end: number; score: number }> = [];

    for (const entity of entities) {
      const label = entity.label ?? '';
      const type = normalizeLocalLabel(label);
      if (!type) continue;
      const start = typeof entity.start === 'number' ? entity.start : -1;
      const end = typeof entity.end === 'number' ? entity.end : -1;
      const score = typeof entity.score === 'number' ? entity.score : 0.9;
      if (start < 0 || end <= start) continue;
      if (score < minConfidence) continue;
      out.push({ type, start, end, score });
    }

    return out;
  }

  async detect(pdf: ExtractedPdf, options: DetectionOptions = {}): Promise<Detection[]> {
    const minConfidence = options.minConfidence ?? 0.75;
    const useRegex = options.useRegex ?? true;
    const useNER = options.useNER ?? false;
    const aggressiveLineMode = options.aggressiveLineMode ?? false;
    const nerModel = options.nerModel ?? 'bert-base';
    const useLocalNerService = options.useLocalNerService ?? false;
    this.lastNerError = null;

    const allDetections: Detection[] = [];

    for (const page of pdf.pages) {
      const pageDetections: Detection[] = [];
      if (useRegex) {
        pageDetections.push(...detectWithContext(page));
        pageDetections.push(...detectWithLayoutContext(page));
        pageDetections.push(...detectLabeledAddressSections(page));
        pageDetections.push(...detectHeaderRecipientBlocks(page));
        pageDetections.push(...detectStandaloneBlocks(page));

        for (const regexRule of REGEX_PATTERNS) {
          const regex = new RegExp(regexRule.pattern.source, regexRule.pattern.flags);
          let match: RegExpExecArray | null = regex.exec(page.text);

          while (match) {
            pageDetections.push(
              mapMatchToDetection(page, regexRule.type, match[0], match.index, match.index + match[0].length, 'regex', 1),
            );
            match = regex.exec(page.text);
          }
        }
      }

      if (useNER) {
        try {
          if (useLocalNerService) {
            const localEntities = await this.detectViaLocalNerService(page.text, minConfidence);
            for (const entity of localEntities) {
              pageDetections.push(
                mapMatchToDetection(
                  page,
                  entity.type,
                  page.text.slice(entity.start, entity.end),
                  entity.start,
                  entity.end,
                  'ner',
                  entity.score,
                ),
              );
            }
          } else {
            if (!this.model) {
              await this.initializeNER(nerModel);
            }

            if (this.model) {
              const nerTokens = await this.model(page.text);
              let searchCursor = 0;

              for (const token of nerTokens) {
                if (token.score < minConfidence) continue;
                const rawTag = token.entity_group ?? token.entity;
                const type = normalizeType(rawTag.split('-').pop() ?? '');
                if (!type) continue;

                const tokenText = (token.word ?? '').replace(/^##/g, '').trim();
                let start = token.start;
                let end = token.end;
                if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
                  if (!tokenText) continue;
                  const foundAt = page.text.toLowerCase().indexOf(tokenText.toLowerCase(), searchCursor);
                  if (foundAt < 0) continue;
                  start = foundAt;
                  end = foundAt + tokenText.length;
                }
                searchCursor = Math.max(searchCursor, end);

                pageDetections.push(
                  mapMatchToDetection(page, type, page.text.slice(start, end), start, end, 'ner', token.score),
                );
              }
            }
          }
        } catch (error) {
          this.lastNerError = error instanceof Error ? error.message : 'Unknown NER loading/inference error';
          // In strict NER mode, fail fast instead of silently falling back to regex-only.
          throw error;
        }
      }

      allDetections.push(...pageDetections);
    }

    const filtered = deduplicateDetections(allDetections).filter((detection) => {
      if (detection.text.trim().length <= 1) return false;
      const pageText = pdf.pages[detection.page - 1]?.text ?? '';
      const page = pdf.pages[detection.page - 1];
      if (!page) return false;
      if (typeof detection.start === 'number' && typeof detection.end === 'number') {
        if (['PERSON', 'ADDRESS', 'EMAIL', 'PHONE'].includes(detection.type) && hasBusinessContext(pageText, detection.start, detection.end)) {
          if (detection.type === 'PERSON') {
            if (
              (!hasBusinessSectionLabelNearby(page, detection) && hasRecipientBlockGeometry(page, detection, 'PERSON')) ||
              hasPersonFieldContext(pageText, detection.start, detection.end) ||
              hasAdjacentRecipientBlock(pageText, detection.start, detection.end, 'PERSON')
            ) {
              // Keep recipient/person blocks even on business-heavy documents.
            } else {
              return false;
            }
          } else if (detection.type === 'ADDRESS') {
            if (hasBusinessAddressContext(pageText, detection.start, detection.end)) return false;
            if (
              (!hasBusinessSectionLabelNearby(page, detection) && hasRecipientBlockGeometry(page, detection, 'ADDRESS')) ||
              hasAddressFieldContext(pageText, detection.start, detection.end) ||
              hasAdjacentRecipientBlock(pageText, detection.start, detection.end, 'ADDRESS')
            ) {
              // Keep recipient address blocks even on business-heavy documents.
            } else {
              return false;
            }
          } else {
            return false;
          }
        }
      }
      if (detection.type === 'PHONE') return isLikelyPhone(detection.text);
      if (detection.type === 'EMAIL') return isLikelyEmail(detection.text);
      if (detection.type === 'IBAN') return isLikelyIban(detection.text);
      if (detection.type === 'ID_NUMBER') {
        if (!isLikelyIdNumber(detection.text)) return false;
      }
      if (detection.type === 'DATE_OF_BIRTH' && detection.source === 'ner') {
        if (typeof detection.start !== 'number' || typeof detection.end !== 'number') return false;
        if (!hasDobContext(pdf.pages[detection.page - 1]?.text ?? '', detection.start, detection.end)) return false;
      }
      if (detection.type === 'ADDRESS') {
        if (detection.source === 'context') {
          if (!isLikelyAddressContextValue(detection.text)) return false;
          if (!isLikelyAddress(detection.text)) {
            if (typeof detection.start !== 'number' || typeof detection.end !== 'number') return false;
            return (
              hasAddressFieldContext(pageText, detection.start, detection.end) ||
              hasAdjacentRecipientBlock(pageText, detection.start, detection.end, 'ADDRESS')
            );
          }
          return true;
        }
        return isLikelyAddress(detection.text);
      }
      if (detection.type === 'PERSON') {
        if (detection.source === 'context') {
          if (!isLikelyPersonContextValue(detection.text)) return false;
          const normalized = detection.text.trim().replace(/\s+/g, ' ');
          const parts = normalized.split(' ');
          if (parts.length === 1) {
            if (typeof detection.start !== 'number' || typeof detection.end !== 'number') return false;
            return (
              hasPersonFieldContext(pageText, detection.start, detection.end) ||
              hasAdjacentRecipientBlock(pageText, detection.start, detection.end, 'PERSON')
            );
          }
          return true;
        }
        return isLikelyPerson(detection.text);
      }
      return true;
    });

    const nonPhone = filtered.filter((detection) => detection.type !== 'PHONE');

    const baseFiltered = filtered.filter((detection) => {
      if (detection.type !== 'PHONE') return true;
      if (typeof detection.start !== 'number' || typeof detection.end !== 'number') return true;
      const start = detection.start;
      const end = detection.end;

      const overlapsNonPhone = nonPhone.some((other) => {
        if (other.page !== detection.page) return false;
        if (typeof other.start !== 'number' || typeof other.end !== 'number') return false;
        return start < other.end && end > other.start;
      });

      return !overlapsNonPhone;
    });

    if (!aggressiveLineMode) {
      return baseFiltered;
    }

    const expanded: Detection[] = [];
    for (const page of pdf.pages) {
      const pageBase = baseFiltered.filter((entry) => entry.page === page.page);
      expanded.push(...expandToLineDetections(page, pageBase));
    }

    return deduplicateDetections([...baseFiltered, ...expanded]);
  }
}
