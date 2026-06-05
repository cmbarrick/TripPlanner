// Seed the FULL sample trips into the SIGNED-IN cloud account.
//
// This mirrors backend/Wander.Api/Data/SeedData.cs (the local dev seed) so the cloud account
// gets the complete itineraries — Sicily's full 17-day plan, packing list, and backlog ideas —
// not an abridged copy. Keep this file in sync with SeedData.cs when the samples change.
//
// HOW TO RUN:
//   1. Sign in to the web app (Profile -> Sign in) so a token is in localStorage.
//   2. Open DevTools (F12) -> Console.
//   3. Paste this entire file and press Enter.
//   4. Reload the page; the trips appear under "My Trips".
//
// Safe to re-run: it skips trips whose title already exists on your account. Ids are omitted so the
// API generates fresh GUIDs and stamps your owner id.
//
// NOTE: because it skips by title, if you already have a PARTIAL "Sicily Adventure" on your account,
// delete it in the app first (trip -> 🗑), then re-run — otherwise the full version is skipped.

(async () => {
  const BASE = 'https://app-wander-dev-azgnto.azurewebsites.net';

  const session = JSON.parse(localStorage.getItem('wander.auth.session.v1') || 'null');
  const token = session && session.accessToken;
  if (!token) {
    console.error('No access token found. Sign in first (Profile -> Sign in), then re-run.');
    return;
  }
  const authHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  // Compact item helper: keeps the data below readable. Currency/status/sortOrder are stamped later.
  const I = (type, title, locationName, startTime, cost, extra = {}) =>
    ({ type, title, locationName, startTime, cost, ...extra });
  const day = (dayNumber, date, weatherSummary, weatherHighC, weatherIcon, items) =>
    ({ dayNumber, date, weatherSummary, weatherHighC, weatherIcon, items });

  const seedTrips = [
    {
      title: 'Sicily Adventure', destination: 'Sicily, Italy',
      startDate: '2026-05-13', endDate: '2026-05-29', travelers: 2,
      coverTheme: 'sicily', estimatedCost: 3200, currency: 'EUR', timeZoneId: 'Europe/Rome',
      unscheduledItems: [
        { type: 'Activity', status: 'Wishlist', title: 'Valley of the Temples', locationName: 'Agrigento', cost: 12, latitude: 37.2900, longitude: 13.5870 },
        { type: 'Activity', status: 'Tentative', title: 'Mount Etna sunset jeep tour', locationName: 'Mount Etna', cost: 95, latitude: 37.7510, longitude: 14.9934 },
        { type: 'Food', status: 'Wishlist', title: 'Granita & brioche at a local bar', locationName: 'Catania', cost: null },
      ],
      packing: [
        'Passports + Real ID',
        'Delta boarding passes',
        'Rental car (Alamo) confirmation',
        'EU plug adapters',
        'Swimsuits + beach towel',
        'Hiking shoes (Etna/Stromboli)',
        'Cash: €240 (Palermo) + €60 (Lipari)',
        'Sunscreen + hat',
      ],
      days: [
        day(1, '2026-05-13', 'Travel day', 22, 'cloud-sun', [
          I('Flight', 'DL4976 Indianapolis → JFK', 'Indianapolis Intl (IND)', '12:54:00', null, { confirmationNo: 'DL4976', latitude: 39.7173, longitude: -86.2944 }),
          I('Flight', 'DL0244 JFK → Catania (overnight)', 'JFK International, New York', '16:40:00', null, { confirmationNo: 'DL0244', latitude: 40.6413, longitude: -73.7781 }),
        ]),
        day(2, '2026-05-14', 'Sunny', 24, 'sun', [
          I('Flight', 'Arrive Catania', 'Catania-Fontanarossa (CTA)', '07:55:00', null, { latitude: 37.4668, longitude: 15.0664 }),
          I('Transport', "Pick up rental car (Alamo) → Central Parking", 'Central Parking, Catania', '08:30:00', null, { latitude: 37.5030, longitude: 15.0870 }),
          I('Activity', 'Catania Walking Tour (2 hrs)', 'Catania old town', '10:15:00', 25, { latitude: 37.5025, longitude: 15.0873, bookingUrl: 'https://gyg.me/ExxOOBQn' }),
          I('Food', 'Lunch in Catania', 'Catania', '12:30:00', 20, { latitude: 37.5079, longitude: 15.0830 }),
          I('Transport', "Drive to Ortigia (1.25 hrs) · Park Molo Sant'Antonio", "Parcheggio Molo Sant'Antonio, Ortigia", '14:00:00', null, { latitude: 37.0626, longitude: 15.2935 }),
          I('Lodging', 'Check in · Ambrogio House Ortigia (washer/dryer)', 'Ortigia, Syracuse', '15:00:00', null, { confirmationNo: 'Airbnb', latitude: 37.0610, longitude: 15.2940, bookingUrl: 'https://www.airbnb.com/rooms/1414414126837141131' }),
        ]),
        day(3, '2026-05-15', 'Sunny', 25, 'sun', [
          I('Activity', 'Run the Rossana Maiorca Bike Trail (4 mi)', 'Syracuse coastal path', '08:00:00', 0, { latitude: 37.0650, longitude: 15.2880 }),
          I('Food', 'Sicilian Street Food Tour (Do Eat Better, 3 hrs)', 'Ortigia, Syracuse', '11:30:00', 70, { latitude: 37.0590, longitude: 15.2930, bookingUrl: 'https://www.viator.com/tours/Syracuse/Siracusa-Street-Food-Walking-Tour/d22435-51159P50' }),
          I('Lodging', 'Night 2 · Ambrogio House Ortigia', 'Ortigia, Syracuse', '21:00:00', null, { latitude: 37.0610, longitude: 15.2940 }),
        ]),
        day(4, '2026-05-16', 'Sunny', 26, 'sun', [
          I('Transport', 'Town hopping: Noto → Modica → Ragusa (1.75 hrs)', 'Val di Noto', '09:00:00', null, { latitude: 36.8910, longitude: 15.0690 }),
          I('Activity', 'Noto Flower Festival (Infiorata)', 'Noto', '10:00:00', 0, { latitude: 36.8910, longitude: 15.0690 }),
          I('Food', 'Chocolate tasting · Antica Dolceria Bonajuto', 'Modica', '13:00:00', 10, { latitude: 36.8580, longitude: 14.7610 }),
          I('Lodging', 'Check in · Iblainsuite Boutique Hotel', 'Ragusa Ibla', '16:00:00', null, { confirmationNo: 'Booking.com', latitude: 36.9270, longitude: 14.7250, bookingUrl: 'https://www.booking.com/Share-JD43a9' }),
          I('Food', 'Dinner @ I Banchi, Ragusa', 'Ragusa Ibla', '20:30:00', 60, { latitude: 36.9250, longitude: 14.7300, bookingUrl: 'https://ibanchiragusa.it/en/homepage/' }),
        ]),
        day(5, '2026-05-17', 'Sunny', 27, 'sun', [
          I('Transport', 'Drive Ragusa → Agrigento (2 hrs)', 'SS115', '09:00:00', null, { latitude: 37.1000, longitude: 14.2000 }),
          I('Lodging', 'Check in · Amuri Holiday Home', 'Agrigento', '11:00:00', null, { confirmationNo: 'Booking.com', latitude: 37.3100, longitude: 13.5850, bookingUrl: 'https://www.booking.com/Share-v1EEjkC' }),
          I('Activity', 'Cala Manbru Beach Club / Torre Salsa', 'Torre Salsa Nature Reserve', '12:30:00', 0, { latitude: 37.3600, longitude: 13.4200, bookingUrl: 'https://calamanbru.com/en' }),
          I('Activity', 'Sunset Tour · Valley of the Temples (2 hrs)', 'Valley of the Temples, Agrigento', '17:45:00', 45, { latitude: 37.2900, longitude: 13.5850, bookingUrl: 'https://gyg.me/vJKBiq0o' }),
        ]),
        day(6, '2026-05-18', 'Breezy', 24, 'cloud-sun', [
          I('Transport', 'Drive Agrigento → Lo Stagnone (2 hrs)', 'Marsala', '08:00:00', null, { latitude: 37.8000, longitude: 12.4350 }),
          I('Activity', 'Bike Tour · Scala dei Turchi (10am–1pm)', 'Scala dei Turchi, Realmonte', '10:00:00', 40, { latitude: 37.2897, longitude: 13.4830, bookingUrl: 'https://gyg.me/ee9yURkF' }),
          I('Lodging', 'Check in · Le Terrazze sullo Stagnone (washer)', 'Lo Stagnone, Marsala', '15:00:00', null, { confirmationNo: 'Booking.com', latitude: 37.8700, longitude: 12.4600, bookingUrl: 'https://www.booking.com/Share-sezYlY' }),
          I('Activity', 'Run the Stagnone Cycle Path (5 mi)', 'Lo Stagnone', '18:00:00', 0, { latitude: 37.8700, longitude: 12.4600, bookingUrl: 'https://es.wikiloc.com/rutas-mountain-bike/sicilia-giro-in-bici-costeggiando-lo-stagnone-di-marsala-126744640' }),
        ]),
        day(7, '2026-05-19', 'Windy', 23, 'cloud-sun', [
          I('Food', 'Breakfast · Wine Bar Il Mulino di Craparotta', 'Marsala', '09:00:00', 15, { latitude: 37.8030, longitude: 12.4350 }),
          I('Activity', 'If wind: kite/wing @ ProKite Alby Rondina', 'Lo Stagnone', '11:00:00', 80, { latitude: 37.8700, longitude: 12.4600, bookingUrl: 'https://www.prokitealbyrondina.com/lessons/' }),
          I('Activity', 'If no wind: day trip to Favignana · Cala Rossa', 'Favignana (ferry from Trapani)', '11:30:00', 25, { latitude: 37.9320, longitude: 12.3290 }),
          I('Lodging', 'Night 6 · Le Terrazze sullo Stagnone', 'Lo Stagnone, Marsala', '21:00:00', null, { latitude: 37.8700, longitude: 12.4600 }),
        ]),
        day(8, '2026-05-20', 'Sunny', 25, 'sun', [
          I('Transport', 'Drive Lo Stagnone → Palermo (1.25 hrs)', 'via Erice / Segesta / Scopello', '11:00:00', null, { latitude: 37.9300, longitude: 12.8000 }),
          I('Activity', 'En route: Erice / San Vito Lo Capo / Segesta', 'Trapani province', '12:00:00', 0, { latitude: 37.9337, longitude: 12.8716 }),
          I('Food', 'Aperitivo · Bar Timi, Kalsa District', 'Kalsa, Palermo', '18:30:00', 18, { latitude: 38.1140, longitude: 13.3660 }),
          I('Lodging', 'Check in · Casa 3 Cupole (€240 cash)', 'Palermo', '15:00:00', 240, { confirmationNo: 'Booking.com', latitude: 38.1157, longitude: 13.3615, bookingUrl: 'https://www.booking.com/Share-wpsJWr' }),
        ]),
        day(9, '2026-05-21', 'Sunny', 26, 'sun', [
          I('Activity', 'Palermo Guided Bike Tour + Street Food (3 hrs)', 'Palermo', '10:00:00', 55, { latitude: 38.1157, longitude: 13.3615, bookingUrl: 'https://gyg.me/rPelUxDs' }),
          I('Transport', 'Drive Palermo → Cefalù (1.25 hrs)', 'A20', '13:30:00', null, { latitude: 38.0700, longitude: 13.7000 }),
          I('Lodging', 'Check in · Sea Sky Suite (washer/dryer)', 'Cefalù', '14:30:00', null, { confirmationNo: 'Booking.com', latitude: 38.0390, longitude: 14.0230, bookingUrl: 'https://www.booking.com/Share-M2HDl7' }),
          I('Activity', 'Wine Tasting @ Villa Toto Resort (2 hrs)', 'Cefalù', '15:50:00', 35, { latitude: 38.0500, longitude: 14.0200 }),
          I('Activity', 'Hike La Rocca', 'La Rocca di Cefalù', '18:30:00', 5, { latitude: 38.0380, longitude: 14.0250 }),
        ]),
        day(10, '2026-05-22', 'Sunny', 27, 'sun', [
          I('Activity', 'Run the Lungomare waterfront path (3 mi)', 'Cefalù seafront', '08:00:00', 0, { latitude: 38.0370, longitude: 14.0190 }),
          I('Activity', 'Chill at the beach', 'Cefalù beach', '11:00:00', 0, { latitude: 38.0360, longitude: 14.0210 }),
          I('Food', "Cooking Class @ Local's Home (location TBD)", 'Cefalù', '17:00:00', 90, { latitude: 38.0390, longitude: 14.0230, bookingUrl: 'https://gyg.me/iJ7YiD6d' }),
          I('Lodging', 'Night 9 · Sea Sky Suite', 'Cefalù', '21:00:00', null, { latitude: 38.0390, longitude: 14.0230 }),
        ]),
        day(11, '2026-05-23', 'Sunny', 25, 'sun', [
          I('Transport', 'Drive Cefalù → Milazzo (1.75 hrs), park guarded lot', 'Parcheggio custodito, Milazzo', '10:30:00', null, { latitude: 38.2210, longitude: 15.2410 }),
          I('Transport', 'Ferry Milazzo → Lipari (Liberty Lines, 50 min)', 'Milazzo port', '14:00:00', 25, { latitude: 38.2190, longitude: 15.2390 }),
          I('Lodging', 'Check in · Casa Eolie (€60 cash, washer)', 'Lipari', '15:00:00', 60, { confirmationNo: 'Booking.com', latitude: 38.4680, longitude: 14.9530, bookingUrl: 'https://www.booking.com/Share-OI2mjpi' }),
          I('Activity', 'Maybe sunset wine @ Tenuta di Castellaro', 'Lipari', '19:00:00', 30, { latitude: 38.4850, longitude: 14.9300, bookingUrl: 'https://www.tenutadicastellaro.it/en/experiences-and-tastings/' }),
        ]),
        day(12, '2026-05-24', 'Sunny', 25, 'sun', [
          I('Activity', 'Scuba Dive · La Gorgonia Diving Center', 'Lipari', '08:30:00', 110, { latitude: 38.4670, longitude: 14.9540, bookingUrl: 'https://www.liparidiving.com/' }),
          I('Lodging', 'Night 11 · Casa Eolie', 'Lipari', '21:00:00', null, { latitude: 38.4680, longitude: 14.9530 }),
        ]),
        day(13, '2026-05-25', 'Clear', 24, 'sun', [
          I('Transport', 'Ferry Lipari → Stromboli (via Panarea, 2 hrs)', 'Lipari port', '08:45:00', 30, { latitude: 38.4680, longitude: 14.9530 }),
          I('Lodging', 'Check in · La Sirenetta Park Hotel', 'Stromboli', '13:00:00', null, { confirmationNo: 'Booking.com', latitude: 38.7930, longitude: 15.2130, bookingUrl: 'https://www.booking.com/Share-DOg1jb' }),
          I('Activity', 'Sunset / night hike · Magmatrek', 'Stromboli volcano', '16:45:00', 60, { latitude: 38.7890, longitude: 15.2110, bookingUrl: 'https://www.magmatrek.it/en/stromboli-volcano-island/' }),
        ]),
        day(14, '2026-05-26', 'Sunny', 26, 'sun', [
          I('Transport', 'Ferry Stromboli → Milazzo (3 hrs)', 'Stromboli port', '09:00:00', 35, { latitude: 38.7930, longitude: 15.2130 }),
          I('Transport', 'Drive Milazzo → Taormina (1 hr)', 'A18', '13:00:00', null, { latitude: 37.9000, longitude: 15.2900 }),
          I('Lodging', 'Check in · Dieffe Apartment (washer)', 'Taormina', '15:00:00', null, { confirmationNo: 'Booking.com', latitude: 37.8520, longitude: 15.2870, bookingUrl: 'https://www.booking.com/hotel/it/dieffe-apartment.html' }),
          I('Activity', 'Maybe sunset in Castelmola (8:11 pm)', 'Castelmola', '20:00:00', 0, { latitude: 37.8640, longitude: 15.2810 }),
        ]),
        day(15, '2026-05-27', 'Sunny', 24, 'sun', [
          I('Activity', 'North Mount Etna Hike with Lunch & Wine', 'North Etna', '08:30:00', 95, { latitude: 37.7700, longitude: 15.0000, bookingUrl: 'https://gyg.me/JxwnpRmV' }),
          I('Activity', 'Ancient Greek Theater (latest entry)', 'Teatro Antico di Taormina', '18:30:00', 15, { latitude: 37.8526, longitude: 15.2920 }),
        ]),
        day(16, '2026-05-28', 'Sunny', 25, 'sun', [
          I('Activity', 'EtnaRunWalk @ Etna Sur', 'South Etna (Rifugio Sapienza)', '08:00:00', 50, { latitude: 37.6990, longitude: 14.9990, bookingUrl: 'https://gyg.me/aH2O8vmh' }),
          I('Activity', 'White Lotus Tour (2 hrs on boat)', 'Taormina bay', '16:00:00', 80, { latitude: 37.8500, longitude: 15.3000, bookingUrl: 'https://gyg.me/DlVL1nub' }),
          I('Food', 'Final cocktail · San Domenico Palace (Bar & Chiostro)', 'Taormina', '20:30:00', 40, { latitude: 37.8512, longitude: 15.2880 }),
        ]),
        day(17, '2026-05-29', 'Travel day', 23, 'cloud-sun', [
          I('Transport', 'Leave for Catania airport (7 am)', 'Taormina → CTA', '07:00:00', null, { latitude: 37.8520, longitude: 15.2870 }),
          I('Flight', 'DL0245 Catania → JFK', 'Catania-Fontanarossa (CTA)', '09:55:00', null, { confirmationNo: 'DL0245', latitude: 37.4668, longitude: 15.0664 }),
          I('Flight', 'DL4914 JFK → Indianapolis', 'JFK International, New York', '18:20:00', null, { confirmationNo: 'DL4914', latitude: 40.6413, longitude: -73.7781 }),
        ]),
      ],
    },
    {
      title: 'Lisbon, Portugal', destination: 'Lisbon, Portugal',
      startDate: '2026-06-10', endDate: '2026-06-14', travelers: 1,
      coverTheme: 'lisbon', estimatedCost: 620, currency: 'EUR',
      days: [
        day(1, '2026-06-10', 'Sunny', 27, 'sun', [
          I('Lodging', 'Check in · Casa do Bairro', 'Alfama, Lisbon', '15:00:00', null, { confirmationNo: 'BK2291', latitude: 38.7128, longitude: -9.1304 }),
          I('Food', 'Dinner · Time Out Market', 'Cais do Sodré, Lisbon', '19:30:00', 25, { latitude: 38.7072, longitude: -9.1459 }),
        ]),
        day(2, '2026-06-11', 'Partly cloudy', 24, 'cloud-sun', [
          I('Activity', 'Belém Tower & Jerónimos', 'Belém, Lisbon', '10:00:00', 18, { latitude: 38.6916, longitude: -9.2160 }),
          I('Food', 'Pastéis de Belém', 'Belém, Lisbon', '12:30:00', 8, { latitude: 38.6975, longitude: -9.2032 }),
          I('Activity', 'Fado show', 'Alfama, Lisbon', '19:30:00', 30, { latitude: 38.7115, longitude: -9.1290, bookingUrl: 'https://www.getyourguide.com/lisbon-l42/fado-show' }),
        ]),
        day(3, '2026-06-12', 'Sunny', 28, 'sun', [
          I('Activity', 'Miradouro da Senhora do Monte', 'Graça, Lisbon', '10:30:00', 0, { latitude: 38.7197, longitude: -9.1300 }),
          I('Food', 'Lunch · Mercado de Campo de Ourique', 'Campo de Ourique', '13:00:00', 20, { latitude: 38.7156, longitude: -9.1660 }),
        ]),
        day(4, '2026-06-13', 'Sunny', 29, 'sun', [
          I('Activity', 'Day trip · Sintra', 'Sintra', '09:00:00', 45, { latitude: 38.7979, longitude: -9.3907 }),
        ]),
      ],
    },
    {
      title: 'Kyoto, Japan', destination: 'Kyoto, Japan',
      startDate: '2026-08-03', endDate: '2026-08-09', travelers: 1,
      coverTheme: 'kyoto', estimatedCost: 1450, currency: 'USD',
      days: [
        day(1, '2026-08-03', 'Humid', 33, 'sun', [
          I('Lodging', 'Check in · Ryokan Shiraume', 'Gion, Kyoto', '15:00:00', null, { confirmationNo: 'RY8841', latitude: 35.0036, longitude: 135.7788 }),
          I('Activity', 'Evening walk · Gion', 'Gion, Kyoto', '18:30:00', 0, { latitude: 35.0037, longitude: 135.7754 }),
        ]),
        day(2, '2026-08-04', 'Sunny', 34, 'sun', [
          I('Activity', 'Fushimi Inari Shrine', 'Fushimi, Kyoto', '08:00:00', 0, { latitude: 34.9671, longitude: 135.7727 }),
        ]),
      ],
    },
    {
      title: 'Swiss Alps', destination: 'Interlaken, Switzerland',
      startDate: '2026-03-01', endDate: '2026-03-05', travelers: 1,
      coverTheme: 'alps', estimatedCost: 1800, currency: 'CHF',
      days: [
        day(1, '2026-03-01', 'Snow', -3, 'snow', [
          I('Activity', 'Jungfraujoch railway', 'Interlaken', '09:00:00', 210, { latitude: 46.5474, longitude: 7.9856 }),
        ]),
      ],
    },
  ];

  // Stamp currency/status/sortOrder so the data literals above stay terse.
  for (const trip of seedTrips) {
    (trip.days || []).forEach((d) =>
      (d.items || []).forEach((it, i) => {
        it.currency = it.currency || trip.currency;
        it.status = it.status || 'Confirmed';
        it.sortOrder = i;
      }),
    );
    (trip.unscheduledItems || []).forEach((it, i) => {
      it.currency = it.currency || trip.currency;
      it.status = it.status || 'Wishlist';
      it.sortOrder = i;
    });
  }

  const existing = await fetch(BASE + '/api/trips', { headers: authHeaders });
  if (!existing.ok) { console.error('Could not list existing trips:', existing.status); return; }
  const existingTitles = new Set((await existing.json()).map((t) => t.title));

  for (const trip of seedTrips) {
    if (existingTitles.has(trip.title)) {
      console.warn('skip (exists, NOT replaced):', trip.title, '— delete it in the app first to re-seed the full version.');
      continue;
    }
    const { packing, ...payload } = trip;
    const res = await fetch(BASE + '/api/trips', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
    if (!res.ok) { console.error('FAILED ' + res.status + ':', trip.title, await res.text()); continue; }
    const created = await res.json();
    console.log('created:', trip.title, '(' + (created.days ? created.days.length : 0) + ' days)');

    // Packing items are created via their own endpoint (not part of the trip create payload).
    for (const name of packing || []) {
      const pr = await fetch(BASE + '/api/trips/' + created.id + '/packing', {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ name }),
      });
      if (!pr.ok) console.error('  packing failed:', name, pr.status);
    }
    if ((packing || []).length) console.log('  + ' + packing.length + ' packing items');
  }
  console.log('Seeding complete — reload the page to see your trips.');
})();
