// Seed the four sample trips into the SIGNED-IN cloud account.
//
// HOW TO RUN:
//   1. Sign in to the web app (Profile -> Sign in) so a token is in localStorage.
//   2. Open DevTools (F12) -> Console.
//   3. Paste this entire file and press Enter.
//   4. Reload the page; the trips appear under "My Trips".
//
// Safe to re-run: it skips trips whose title already exists on your account.
// Ids are intentionally omitted so the API generates fresh GUIDs and stamps your owner id.

(async () => {
  const BASE = 'https://app-wander-dev-azgnto.azurewebsites.net';

  const session = JSON.parse(localStorage.getItem('wander.auth.session.v1') || 'null');
  const token = session && session.accessToken;
  if (!token) {
    console.error('No access token found. Sign in first (Profile -> Sign in), then re-run.');
    return;
  }
  const authHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const seedTrips = [
    {
      title: 'Sicily Adventure', destination: 'Sicily, Italy',
      startDate: '2026-05-13', endDate: '2026-05-29', travelers: 2,
      coverTheme: 'sicily', estimatedCost: 3200, currency: 'EUR', timeZoneId: 'Europe/Rome',
      unscheduledItems: [
        { type: 'Activity', status: 'Wishlist', title: 'Valley of the Temples', locationName: 'Agrigento', cost: 12, currency: 'EUR', sortOrder: 0 },
        { type: 'Activity', status: 'Tentative', title: 'Mount Etna sunset jeep tour', locationName: 'Mount Etna', cost: 95, currency: 'EUR', sortOrder: 1 },
        { type: 'Food', status: 'Wishlist', title: 'Granita & brioche at a local bar', locationName: 'Catania', cost: null, currency: 'EUR', sortOrder: 2 },
      ],
      days: [
        { dayNumber: 2, date: '2026-05-14', weatherSummary: 'Sunny', weatherHighC: 24, weatherIcon: 'sun', items: [
          { type: 'Activity', status: 'Confirmed', title: 'Catania Walking Tour (2 hrs)', locationName: 'Catania old town', startTime: '10:15:00', cost: 25, currency: 'EUR', sortOrder: 0 },
          { type: 'Lodging', status: 'Confirmed', title: 'Check in \u00b7 Ambrogio House Ortigia', locationName: 'Ortigia, Syracuse', startTime: '15:00:00', cost: null, currency: 'EUR', bookingUrl: 'https://www.airbnb.com/rooms/1414414126837141131', sortOrder: 1 },
        ] },
        { dayNumber: 4, date: '2026-05-16', weatherSummary: 'Sunny', weatherHighC: 26, weatherIcon: 'sun', items: [
          { type: 'Activity', status: 'Confirmed', title: 'Noto Flower Festival (Infiorata)', locationName: 'Noto', startTime: '10:00:00', cost: 0, currency: 'EUR', sortOrder: 0 },
          { type: 'Food', status: 'Confirmed', title: 'Dinner @ I Banchi, Ragusa', locationName: 'Ragusa Ibla', startTime: '20:30:00', cost: 60, currency: 'EUR', bookingUrl: 'https://ibanchiragusa.it/en/homepage/', sortOrder: 1 },
        ] },
      ],
    },
    {
      title: 'Lisbon, Portugal', destination: 'Lisbon, Portugal',
      startDate: '2026-06-10', endDate: '2026-06-14', travelers: 1,
      coverTheme: 'lisbon', estimatedCost: 620, currency: 'EUR',
      days: [
        { dayNumber: 1, date: '2026-06-10', weatherSummary: 'Sunny', weatherHighC: 27, weatherIcon: 'sun', items: [
          { type: 'Lodging', status: 'Confirmed', title: 'Check in \u00b7 Casa do Bairro', locationName: 'Alfama, Lisbon', startTime: '15:00:00', cost: null, currency: 'EUR', confirmationNo: 'BK2291', sortOrder: 0 },
          { type: 'Food', status: 'Confirmed', title: 'Dinner \u00b7 Time Out Market', locationName: 'Cais do Sodr\u00e9, Lisbon', startTime: '19:30:00', cost: 25, currency: 'EUR', sortOrder: 1 },
        ] },
        { dayNumber: 2, date: '2026-06-11', weatherSummary: 'Partly cloudy', weatherHighC: 24, weatherIcon: 'cloud-sun', items: [
          { type: 'Activity', status: 'Confirmed', title: 'Bel\u00e9m Tower & Jer\u00f3nimos', locationName: 'Bel\u00e9m, Lisbon', startTime: '10:00:00', cost: 18, currency: 'EUR', sortOrder: 0 },
          { type: 'Food', status: 'Confirmed', title: 'Past\u00e9is de Bel\u00e9m', locationName: 'Bel\u00e9m, Lisbon', startTime: '12:30:00', cost: 8, currency: 'EUR', sortOrder: 1 },
          { type: 'Activity', status: 'Confirmed', title: 'Fado show', locationName: 'Alfama, Lisbon', startTime: '19:30:00', cost: 30, currency: 'EUR', bookingUrl: 'https://www.getyourguide.com/lisbon-l42/fado-show', sortOrder: 2 },
        ] },
      ],
    },
    {
      title: 'Kyoto, Japan', destination: 'Kyoto, Japan',
      startDate: '2026-08-03', endDate: '2026-08-09', travelers: 1,
      coverTheme: 'kyoto', estimatedCost: 1450, currency: 'USD',
      days: [
        { dayNumber: 1, date: '2026-08-03', weatherSummary: 'Humid', weatherHighC: 33, weatherIcon: 'sun', items: [
          { type: 'Lodging', status: 'Confirmed', title: 'Check in \u00b7 Ryokan Shiraume', locationName: 'Gion, Kyoto', startTime: '15:00:00', cost: null, currency: 'USD', confirmationNo: 'RY8841', sortOrder: 0 },
        ] },
      ],
    },
    {
      title: 'Swiss Alps', destination: 'Interlaken, Switzerland',
      startDate: '2026-03-01', endDate: '2026-03-05', travelers: 1,
      coverTheme: 'alps', estimatedCost: 1800, currency: 'CHF',
      days: [],
    },
  ];

  const existing = await fetch(BASE + '/api/trips', { headers: authHeaders });
  if (!existing.ok) { console.error('Could not list existing trips:', existing.status); return; }
  const existingTitles = new Set((await existing.json()).map((t) => t.title));

  for (const trip of seedTrips) {
    if (existingTitles.has(trip.title)) { console.log('skip (exists):', trip.title); continue; }
    const res = await fetch(BASE + '/api/trips', { method: 'POST', headers: authHeaders, body: JSON.stringify(trip) });
    console.log((res.ok ? 'created:' : 'FAILED ' + res.status + ':'), trip.title);
    if (!res.ok) console.error(await res.text());
  }
  console.log('Seeding complete \u2014 reload the page to see your trips.');
})();
