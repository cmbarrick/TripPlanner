import { parseFlightNumber, toIcaoFlightNumber, IATA_TO_ICAO } from './airlineCodes';
import { flightAwareUrl, flightRadar24Url } from './routing';

describe('parseFlightNumber', () => {
  it('parses compact IATA format', () => {
    expect(parseFlightNumber('DL4976')).toEqual({ airlineCode: 'DL', number: '4976' });
  });
  it('parses spaced IATA format', () => {
    expect(parseFlightNumber('BA 123')).toEqual({ airlineCode: 'BA', number: '123' });
  });
  it('parses compact ICAO format', () => {
    expect(parseFlightNumber('DAL4976')).toEqual({ airlineCode: 'DAL', number: '4976' });
  });
  it('parses lowercase input', () => {
    expect(parseFlightNumber('dl4976')).toEqual({ airlineCode: 'DL', number: '4976' });
  });
  it('returns null for garbage input', () => {
    expect(parseFlightNumber('not-a-flight')).toBeNull();
  });
  it('parses suffix letter (e.g. diverted flight)', () => {
    expect(parseFlightNumber('DL4976A')).toEqual({ airlineCode: 'DL', number: '4976A' });
  });
});

describe('toIcaoFlightNumber', () => {
  it('converts IATA DL → DAL', () => {
    expect(toIcaoFlightNumber('DL4976')).toBe('DAL4976');
  });
  it('converts IATA BA → BAW', () => {
    expect(toIcaoFlightNumber('BA 123')).toBe('BAW123');
  });
  it('passes through already-ICAO codes unchanged', () => {
    expect(toIcaoFlightNumber('DAL4976')).toBe('DAL4976');
  });
  it('passes through unknown 2-letter codes unchanged', () => {
    expect(toIcaoFlightNumber('XX999')).toBe('XX999');
  });
  it('handles lowercase input', () => {
    expect(toIcaoFlightNumber('dl4976')).toBe('DAL4976');
  });
  it('converts EK (Emirates) → UAE', () => {
    expect(toIcaoFlightNumber('EK 214')).toBe('UAE214');
  });
  it('converts QR (Qatar) → QTR', () => {
    expect(toIcaoFlightNumber('QR42')).toBe('QTR42');
  });
});

describe('flightAwareUrl', () => {
  it('uses ICAO code in the URL', () => {
    expect(flightAwareUrl('DL4976')).toBe('https://www.flightaware.com/live/flight/DAL4976');
  });
  it('passes ICAO codes through unchanged', () => {
    expect(flightAwareUrl('DAL4976')).toBe('https://www.flightaware.com/live/flight/DAL4976');
  });
});

describe('flightRadar24Url', () => {
  it('uses the raw (IATA) code — FR24 handles it natively', () => {
    expect(flightRadar24Url('DL4976')).toBe('https://www.flightradar24.com/DL4976');
  });
  it('strips spaces', () => {
    expect(flightRadar24Url('DL 4976')).toBe('https://www.flightradar24.com/DL4976');
  });
});

describe('IATA_TO_ICAO table sanity', () => {
  it('all IATA keys are 2 characters', () => {
    for (const key of Object.keys(IATA_TO_ICAO)) {
      expect(key.length).toBe(2);
    }
  });
  it('all ICAO values are 3 characters', () => {
    for (const val of Object.values(IATA_TO_ICAO)) {
      expect(val.length).toBe(3);
    }
  });
  it('covers the major US carriers', () => {
    expect(IATA_TO_ICAO['DL']).toBe('DAL');
    expect(IATA_TO_ICAO['AA']).toBe('AAL');
    expect(IATA_TO_ICAO['UA']).toBe('UAL');
    expect(IATA_TO_ICAO['WN']).toBe('SWA');
  });
});
