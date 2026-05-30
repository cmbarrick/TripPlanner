import { Trip } from './types';

// Local fallback data so the UI renders even when the API is unreachable.
// Mirrors the API's seeded trips.
export const mockTrips: Trip[] = [
  {
    id: '5111c1a0-0000-4000-8000-00000000515c',
    ownerId: 'demo-user',
    title: 'Sicily Adventure',
    destination: 'Sicily, Italy',
    startDate: '2026-05-13',
    endDate: '2026-05-29',
    travelers: 2,
    coverTheme: 'sicily',
    estimatedCost: 3200,
    currency: 'EUR',
    timeZoneId: 'Europe/Rome',
    nights: 16,
    createdAt: '',
    updatedAt: '',
    days: [
      {
        id: 'sic-d2', tripId: '5111c1a0-0000-4000-8000-00000000515c', dayNumber: 2, date: '2026-05-14',
        weatherSummary: 'Sunny', weatherHighC: 24, weatherIcon: 'sun',
        items: [
          { id: 'sic-i1', dayId: 'sic-d2', type: 'Activity', title: 'Catania Walking Tour (2 hrs)', locationName: 'Catania old town', startTime: '10:15:00', cost: 25, currency: 'EUR', sortOrder: 0 },
          { id: 'sic-i2', dayId: 'sic-d2', type: 'Lodging', title: 'Check in · Ambrogio House Ortigia', locationName: 'Ortigia, Syracuse', startTime: '15:00:00', cost: null, currency: 'EUR', bookingUrl: 'https://www.airbnb.com/rooms/1414414126837141131', sortOrder: 1 },
        ],
      },
      {
        id: 'sic-d4', tripId: '5111c1a0-0000-4000-8000-00000000515c', dayNumber: 4, date: '2026-05-16',
        weatherSummary: 'Sunny', weatherHighC: 26, weatherIcon: 'sun',
        items: [
          { id: 'sic-i3', dayId: 'sic-d4', type: 'Activity', title: 'Noto Flower Festival (Infiorata)', locationName: 'Noto', startTime: '10:00:00', cost: 0, currency: 'EUR', sortOrder: 0 },
          { id: 'sic-i4', dayId: 'sic-d4', type: 'Food', title: 'Dinner @ I Banchi, Ragusa', locationName: 'Ragusa Ibla', startTime: '20:30:00', cost: 60, currency: 'EUR', bookingUrl: 'https://ibanchiragusa.it/en/homepage/', sortOrder: 1 },
        ],
      },
    ],
  },
  {
    id: '11111111-1111-1111-1111-111111111111',
    ownerId: 'demo-user',
    title: 'Lisbon, Portugal',
    destination: 'Lisbon, Portugal',
    startDate: '2026-06-10',
    endDate: '2026-06-14',
    travelers: 1,
    coverTheme: 'lisbon',
    estimatedCost: 620,
    currency: 'EUR',
    nights: 4,
    createdAt: '',
    updatedAt: '',
    days: [
      {
        id: 'd1', tripId: '1', dayNumber: 1, date: '2026-06-10',
        weatherSummary: 'Sunny', weatherHighC: 27, weatherIcon: 'sun',
        items: [
          { id: 'i1', dayId: 'd1', type: 'Lodging', title: 'Check in · Casa do Bairro', locationName: 'Alfama, Lisbon', startTime: '15:00:00', cost: null, currency: 'EUR', confirmationNo: 'BK2291', sortOrder: 0 },
          { id: 'i2', dayId: 'd1', type: 'Food', title: 'Dinner · Time Out Market', locationName: 'Cais do Sodré, Lisbon', startTime: '19:30:00', cost: 25, currency: 'EUR', sortOrder: 1 },
        ],
      },
      {
        id: 'd2', tripId: '1', dayNumber: 2, date: '2026-06-11',
        weatherSummary: 'Partly cloudy', weatherHighC: 24, weatherIcon: 'cloud-sun',
        items: [
          { id: 'i3', dayId: 'd2', type: 'Activity', title: 'Belém Tower & Jerónimos', locationName: 'Belém, Lisbon', startTime: '10:00:00', cost: 18, currency: 'EUR', sortOrder: 0 },
          { id: 'i4', dayId: 'd2', type: 'Food', title: 'Pastéis de Belém', locationName: 'Belém, Lisbon', startTime: '12:30:00', cost: 8, currency: 'EUR', sortOrder: 1 },
          { id: 'i5', dayId: 'd2', type: 'Activity', title: 'Fado show', locationName: 'Alfama, Lisbon', startTime: '19:30:00', cost: 30, currency: 'EUR', bookingUrl: 'https://www.getyourguide.com/lisbon-l42/fado-show', sortOrder: 2 },
        ],
      },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    ownerId: 'demo-user',
    title: 'Kyoto, Japan',
    destination: 'Kyoto, Japan',
    startDate: '2026-08-03',
    endDate: '2026-08-09',
    travelers: 1,
    coverTheme: 'kyoto',
    estimatedCost: 1450,
    currency: 'USD',
    nights: 6,
    createdAt: '',
    updatedAt: '',
    days: [
      {
        id: 'k1', tripId: '2', dayNumber: 1, date: '2026-08-03',
        weatherSummary: 'Humid', weatherHighC: 33, weatherIcon: 'sun',
        items: [
          { id: 'ki1', dayId: 'k1', type: 'Lodging', title: 'Check in · Ryokan Shiraume', locationName: 'Gion, Kyoto', startTime: '15:00:00', cost: null, currency: 'USD', confirmationNo: 'RY8841', sortOrder: 0 },
        ],
      },
    ],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    ownerId: 'demo-user',
    title: 'Swiss Alps',
    destination: 'Interlaken, Switzerland',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    travelers: 1,
    coverTheme: 'alps',
    estimatedCost: 1800,
    currency: 'CHF',
    nights: 4,
    createdAt: '',
    updatedAt: '',
    days: [],
  },
];
