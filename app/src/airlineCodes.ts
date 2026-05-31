/**
 * IATA (2-letter, on your ticket) → ICAO (3-letter, used in FlightAware URLs).
 * Source: ICAO Doc 8585. Updated for currently operating carriers.
 * FlightRadar24 accepts IATA codes directly; only FlightAware needs ICAO.
 */
export const IATA_TO_ICAO: Record<string, string> = {
  // North America
  AA: 'AAL', // American Airlines
  AS: 'ASA', // Alaska Airlines
  B6: 'JBU', // JetBlue
  DL: 'DAL', // Delta Air Lines
  F9: 'FFT', // Frontier Airlines
  G4: 'AAY', // Allegiant Air
  HA: 'HAL', // Hawaiian Airlines
  NK: 'NKS', // Spirit Airlines
  UA: 'UAL', // United Airlines
  WN: 'SWA', // Southwest Airlines
  YX: 'RPA', // Republic Airways
  AC: 'ACA', // Air Canada
  PD: 'POE', // Porter Airlines
  WS: 'WJA', // WestJet
  AM: 'AMX', // Aeromexico
  Y4: 'VOI', // Volaris

  // Europe
  BA: 'BAW', // British Airways
  EI: 'EIN', // Aer Lingus
  FR: 'RYR', // Ryanair
  U2: 'EZY', // easyJet
  LH: 'DLH', // Lufthansa
  EW: 'EWG', // Eurowings
  OS: 'AUA', // Austrian Airlines
  LX: 'SWR', // Swiss International
  AF: 'AFR', // Air France
  TO: 'TAM', // Transavia France
  KL: 'KLM', // KLM Royal Dutch
  SN: 'DAT', // Brussels Airlines
  IB: 'IBE', // Iberia
  VY: 'VLG', // Vueling
  TP: 'TAP', // TAP Air Portugal
  AZ: 'AZA', // ITA Airways
  SK: 'SAS', // Scandinavian Airlines
  AY: 'FIN', // Finnair
  DY: 'NAX', // Norwegian
  BT: 'BTI', // airBaltic
  LO: 'LOT', // LOT Polish Airlines
  OK: 'CSA', // Czech Airlines
  RO: 'ROT', // Tarom
  TK: 'THY', // Turkish Airlines
  PC: 'PGT', // Pegasus Airlines
  W6: 'WZZ', // Wizz Air
  SU: 'AFL', // Aeroflot
  S7: 'SBI', // S7 Airlines (Siberia)
  FI: 'ICE', // Icelandair
  TF: 'SCW', // Braathens Regional / TF
  UX: 'AEA', // Air Europa

  // Middle East & Africa
  EK: 'UAE', // Emirates
  EY: 'ETD', // Etihad Airways
  QR: 'QTR', // Qatar Airways
  GF: 'GFA', // Gulf Air
  WY: 'OMA', // Oman Air
  SV: 'SVA', // Saudia
  FZ: 'FDB', // flydubai
  G9: 'ABY', // Air Arabia
  MS: 'MSR', // EgyptAir
  ET: 'ETH', // Ethiopian Airlines
  SA: 'SAA', // South African Airways
  KQ: 'KQA', // Kenya Airways
  AT: 'RAM', // Royal Air Maroc

  // Asia-Pacific
  SQ: 'SIA', // Singapore Airlines
  MI: 'SLK', // SilkAir (now SQ)
  MH: 'MAS', // Malaysia Airlines
  GA: 'GIA', // Garuda Indonesia
  PR: 'PAL', // Philippine Airlines
  TG: 'THA', // Thai Airways
  VN: 'HVN', // Vietnam Airlines
  VJ: 'VJC', // VietJet Air
  CX: 'CPA', // Cathay Pacific
  KA: 'HDA', // Cathay Dragon (now CX)
  JL: 'JAL', // Japan Airlines
  NH: 'ANA', // All Nippon Airways
  KE: 'KAL', // Korean Air
  OZ: 'AAR', // Asiana Airlines
  TW: 'TWB', // T'way Air
  CA: 'CCA', // Air China
  MU: 'CES', // China Eastern
  CZ: 'CSN', // China Southern
  HU: 'CHH', // Hainan Airlines
  FM: 'CSH', // Shanghai Airlines
  '3U': 'CSC', // Sichuan Airlines
  AI: 'AIC', // Air India
  UK: 'VTI', // Vistara
  QF: 'QFA', // Qantas
  JQ: 'JST', // Jetstar
  NZ: 'ANZ', // Air New Zealand
  VA: 'VOZ', // Virgin Australia

  // Latin America
  LA: 'LAN', // LATAM Airlines
  JJ: 'TAM', // LATAM Brasil
  G3: 'GLO', // Gol Linhas Aéreas
  AD: 'AZU', // Azul Brazilian Airlines
  AV: 'AVA', // Avianca
  CM: 'CMP', // Copa Airlines
  AR: 'ARG', // Aerolíneas Argentinas
};

/**
 * Parses a raw flight input into { airlineCode, number }.
 * Handles "DL4976", "DL 4976", "DAL4976", "BA 123" etc.
 */
export function parseFlightNumber(raw: string): { airlineCode: string; number: string } | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  const match = cleaned.match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/);
  if (!match) return null;
  return { airlineCode: match[1]!, number: match[2]! };
}

/**
 * Converts an IATA flight number to its ICAO equivalent for FlightAware URLs.
 * If the code is already ICAO (3 letters) or unknown, returns it unchanged.
 * e.g. "DL4976" → "DAL4976", "BA123" → "BAW123", "DAL4976" → "DAL4976"
 */
export function toIcaoFlightNumber(raw: string): string {
  const parsed = parseFlightNumber(raw);
  if (!parsed) return raw.trim().toUpperCase().replace(/\s+/g, '');

  const { airlineCode, number } = parsed;
  // Already ICAO (3-letter) — leave it.
  if (airlineCode.length === 3) return `${airlineCode}${number}`;

  const icao = IATA_TO_ICAO[airlineCode];
  return icao ? `${icao}${number}` : `${airlineCode}${number}`;
}
