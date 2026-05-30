using Wander.Api.Models;

namespace Wander.Api.Data;

/// <summary>Realistic fake trips used to run the app without a database.</summary>
public static class SeedData
{
    public static List<Trip> CreateTrips()
    {
        return new List<Trip> { Sicily(), Lisbon(), Kyoto(), SwissAlps() };
    }

    public static List<Trip> CreateTripsForOwner(string ownerId)
    {
        var trips = CreateTrips();
        foreach (var trip in trips)
        {
            var tripId = Guid.NewGuid();
            trip.Id = tripId;
            trip.OwnerId = ownerId;
            trip.CreatedAt = DateTimeOffset.UtcNow;
            trip.UpdatedAt = trip.CreatedAt;
            trip.DeletedAt = null;

            foreach (var day in trip.Days)
            {
                var dayId = Guid.NewGuid();
                day.Id = dayId;
                day.TripId = tripId;
                day.OwnerId = ownerId;
                day.CreatedAt = trip.CreatedAt;
                day.UpdatedAt = trip.CreatedAt;
                day.DeletedAt = null;

                foreach (var item in day.Items)
                {
                    item.Id = Guid.NewGuid();
                    item.TripId = tripId;
                    item.DayId = dayId;
                    item.OwnerId = ownerId;
                    item.CreatedAt = trip.CreatedAt;
                    item.UpdatedAt = trip.CreatedAt;
                    item.DeletedAt = null;
                }

                foreach (var packingItem in day.PackingItems)
                {
                    packingItem.Id = Guid.NewGuid();
                    packingItem.DayId = dayId;
                    packingItem.OwnerId = ownerId;
                    packingItem.CreatedAt = trip.CreatedAt;
                    packingItem.UpdatedAt = trip.CreatedAt;
                    packingItem.DeletedAt = null;
                }
            }

            for (var i = 0; i < trip.UnscheduledItems.Count; i++)
            {
                var item = trip.UnscheduledItems[i];
                item.Id = Guid.NewGuid();
                item.TripId = tripId;
                item.DayId = null;
                item.OwnerId = ownerId;
                item.SortOrder = i;
                item.CreatedAt = trip.CreatedAt;
                item.UpdatedAt = trip.CreatedAt;
                item.DeletedAt = null;
            }
        }

        return trips;
    }

    /// <summary>
    /// The user's real "Sicily Adventure" plan (May 2026) — a long, multi-town road trip used to
    /// exercise the full Phase 1 feature set (long itinerary, multi-location days, cost rollup,
    /// conflict detection, calendar). Coordinates are approximate for the map work in Phase 2.
    /// </summary>
    private static Trip Sicily()
    {
        var trip = new Trip
        {
            Id = Guid.Parse("5111c1a0-0000-4000-8000-00000000515c"),
            OwnerId = "demo-user",
            Title = "Sicily Adventure",
            Destination = "Sicily, Italy",
            StartDate = new DateOnly(2026, 5, 13),
            EndDate = new DateOnly(2026, 5, 29),
            Travelers = 2,
            CoverTheme = "sicily",
            EstimatedCost = 3200m,
            Currency = "EUR",
            TimeZoneId = "Europe/Rome"
        };

        // Ideas backlog — places we want to fit in but haven't pinned to a day yet.
        AddWishlist(trip, ItineraryItemType.Activity, "Valley of the Temples", "Agrigento",
            cost: 12m, lat: 37.2900, lng: 13.5870);
        AddWishlist(trip, ItineraryItemType.Activity, "Mount Etna sunset jeep tour", "Mount Etna",
            status: ItineraryItemStatus.Tentative, cost: 95m, lat: 37.7510, lng: 14.9934);
        AddWishlist(trip, ItineraryItemType.Food, "Granita & brioche at a local bar", "Catania");

        var d1 = NewDay(trip, 1, new DateOnly(2026, 5, 13), "Travel day", 22, "cloud-sun");
        AddItem(d1, ItineraryItemType.Flight, "DL4976 Indianapolis → JFK", "Indianapolis Intl (IND)",
            new TimeOnly(12, 54), cost: null, conf: "DL4976", lat: 39.7173, lng: -86.2944);
        AddItem(d1, ItineraryItemType.Flight, "DL0244 JFK → Catania (overnight)", "JFK International, New York",
            new TimeOnly(16, 40), cost: null, conf: "DL0244", lat: 40.6413, lng: -73.7781);

        var d2 = NewDay(trip, 2, new DateOnly(2026, 5, 14), "Sunny", 24, "sun");
        AddItem(d2, ItineraryItemType.Flight, "Arrive Catania", "Catania-Fontanarossa (CTA)",
            new TimeOnly(7, 55), cost: null, lat: 37.4668, lng: 15.0664);
        AddItem(d2, ItineraryItemType.Transport, "Pick up rental car (Alamo) → Central Parking", "Central Parking, Catania",
            new TimeOnly(8, 30), cost: null, lat: 37.5030, lng: 15.0870);
        AddItem(d2, ItineraryItemType.Activity, "Catania Walking Tour (2 hrs)", "Catania old town",
            new TimeOnly(10, 15), cost: 25m, lat: 37.5025, lng: 15.0873, bookingUrl: "https://gyg.me/ExxOOBQn");
        AddItem(d2, ItineraryItemType.Food, "Lunch in Catania", "Catania",
            new TimeOnly(12, 30), cost: 20m, lat: 37.5079, lng: 15.0830);
        AddItem(d2, ItineraryItemType.Transport, "Drive to Ortigia (1.25 hrs) · Park Molo Sant'Antonio", "Parcheggio Molo Sant'Antonio, Ortigia",
            new TimeOnly(14, 0), cost: null, lat: 37.0626, lng: 15.2935);
        AddItem(d2, ItineraryItemType.Lodging, "Check in · Ambrogio House Ortigia (washer/dryer)", "Ortigia, Syracuse",
            new TimeOnly(15, 0), cost: null, conf: "Airbnb", lat: 37.0610, lng: 15.2940,
            bookingUrl: "https://www.airbnb.com/rooms/1414414126837141131");

        var d3 = NewDay(trip, 3, new DateOnly(2026, 5, 15), "Sunny", 25, "sun");
        AddItem(d3, ItineraryItemType.Activity, "Run the Rossana Maiorca Bike Trail (4 mi)", "Syracuse coastal path",
            new TimeOnly(8, 0), cost: 0m, lat: 37.0650, lng: 15.2880);
        AddItem(d3, ItineraryItemType.Food, "Sicilian Street Food Tour (Do Eat Better, 3 hrs)", "Ortigia, Syracuse",
            new TimeOnly(11, 30), cost: 70m, lat: 37.0590, lng: 15.2930,
            bookingUrl: "https://www.viator.com/tours/Syracuse/Siracusa-Street-Food-Walking-Tour/d22435-51159P50");
        AddItem(d3, ItineraryItemType.Lodging, "Night 2 · Ambrogio House Ortigia", "Ortigia, Syracuse",
            new TimeOnly(21, 0), cost: null, lat: 37.0610, lng: 15.2940);

        var d4 = NewDay(trip, 4, new DateOnly(2026, 5, 16), "Sunny", 26, "sun");
        AddItem(d4, ItineraryItemType.Transport, "Town hopping: Noto → Modica → Ragusa (1.75 hrs)", "Val di Noto",
            new TimeOnly(9, 0), cost: null, lat: 36.8910, lng: 15.0690);
        AddItem(d4, ItineraryItemType.Activity, "Noto Flower Festival (Infiorata)", "Noto",
            new TimeOnly(10, 0), cost: 0m, lat: 36.8910, lng: 15.0690);
        AddItem(d4, ItineraryItemType.Food, "Chocolate tasting · Antica Dolceria Bonajuto", "Modica",
            new TimeOnly(13, 0), cost: 10m, lat: 36.8580, lng: 14.7610);
        AddItem(d4, ItineraryItemType.Lodging, "Check in · Iblainsuite Boutique Hotel", "Ragusa Ibla",
            new TimeOnly(16, 0), cost: null, conf: "Booking.com", lat: 36.9270, lng: 14.7250,
            bookingUrl: "https://www.booking.com/Share-JD43a9");
        AddItem(d4, ItineraryItemType.Food, "Dinner @ I Banchi, Ragusa", "Ragusa Ibla",
            new TimeOnly(20, 30), cost: 60m, lat: 36.9250, lng: 14.7300,
            bookingUrl: "https://ibanchiragusa.it/en/homepage/");

        var d5 = NewDay(trip, 5, new DateOnly(2026, 5, 17), "Sunny", 27, "sun");
        AddItem(d5, ItineraryItemType.Transport, "Drive Ragusa → Agrigento (2 hrs)", "SS115",
            new TimeOnly(9, 0), cost: null, lat: 37.1000, lng: 14.2000);
        AddItem(d5, ItineraryItemType.Lodging, "Check in · Amuri Holiday Home", "Agrigento",
            new TimeOnly(11, 0), cost: null, conf: "Booking.com", lat: 37.3100, lng: 13.5850,
            bookingUrl: "https://www.booking.com/Share-v1EEjkC");
        AddItem(d5, ItineraryItemType.Activity, "Cala Manbru Beach Club / Torre Salsa", "Torre Salsa Nature Reserve",
            new TimeOnly(12, 30), cost: 0m, lat: 37.3600, lng: 13.4200,
            bookingUrl: "https://calamanbru.com/en");
        AddItem(d5, ItineraryItemType.Activity, "Sunset Tour · Valley of the Temples (2 hrs)", "Valley of the Temples, Agrigento",
            new TimeOnly(17, 45), cost: 45m, lat: 37.2900, lng: 13.5850,
            bookingUrl: "https://gyg.me/vJKBiq0o");

        var d6 = NewDay(trip, 6, new DateOnly(2026, 5, 18), "Breezy", 24, "cloud-sun");
        AddItem(d6, ItineraryItemType.Transport, "Drive Agrigento → Lo Stagnone (2 hrs)", "Marsala",
            new TimeOnly(8, 0), cost: null, lat: 37.8000, lng: 12.4350);
        AddItem(d6, ItineraryItemType.Activity, "Bike Tour · Scala dei Turchi (10am–1pm)", "Scala dei Turchi, Realmonte",
            new TimeOnly(10, 0), cost: 40m, lat: 37.2897, lng: 13.4830,
            bookingUrl: "https://gyg.me/ee9yURkF");
        AddItem(d6, ItineraryItemType.Lodging, "Check in · Le Terrazze sullo Stagnone (washer)", "Lo Stagnone, Marsala",
            new TimeOnly(15, 0), cost: null, conf: "Booking.com", lat: 37.8700, lng: 12.4600,
            bookingUrl: "https://www.booking.com/Share-sezYlY");
        AddItem(d6, ItineraryItemType.Activity, "Run the Stagnone Cycle Path (5 mi)", "Lo Stagnone",
            new TimeOnly(18, 0), cost: 0m, lat: 37.8700, lng: 12.4600,
            bookingUrl: "https://es.wikiloc.com/rutas-mountain-bike/sicilia-giro-in-bici-costeggiando-lo-stagnone-di-marsala-126744640");

        var d7 = NewDay(trip, 7, new DateOnly(2026, 5, 19), "Windy", 23, "cloud-sun");
        AddItem(d7, ItineraryItemType.Food, "Breakfast · Wine Bar Il Mulino di Craparotta", "Marsala",
            new TimeOnly(9, 0), cost: 15m, lat: 37.8030, lng: 12.4350);
        AddItem(d7, ItineraryItemType.Activity, "If wind: kite/wing @ ProKite Alby Rondina", "Lo Stagnone",
            new TimeOnly(11, 0), cost: 80m, lat: 37.8700, lng: 12.4600,
            bookingUrl: "https://www.prokitealbyrondina.com/lessons/");
        AddItem(d7, ItineraryItemType.Activity, "If no wind: day trip to Favignana · Cala Rossa", "Favignana (ferry from Trapani)",
            new TimeOnly(11, 30), cost: 25m, lat: 37.9320, lng: 12.3290);
        AddItem(d7, ItineraryItemType.Lodging, "Night 6 · Le Terrazze sullo Stagnone", "Lo Stagnone, Marsala",
            new TimeOnly(21, 0), cost: null, lat: 37.8700, lng: 12.4600);

        var d8 = NewDay(trip, 8, new DateOnly(2026, 5, 20), "Sunny", 25, "sun");
        AddItem(d8, ItineraryItemType.Transport, "Drive Lo Stagnone → Palermo (1.25 hrs)", "via Erice / Segesta / Scopello",
            new TimeOnly(11, 0), cost: null, lat: 37.9300, lng: 12.8000);
        AddItem(d8, ItineraryItemType.Activity, "En route: Erice / San Vito Lo Capo / Segesta", "Trapani province",
            new TimeOnly(12, 0), cost: 0m, lat: 37.9337, lng: 12.8716);
        AddItem(d8, ItineraryItemType.Food, "Aperitivo · Bar Timi, Kalsa District", "Kalsa, Palermo",
            new TimeOnly(18, 30), cost: 18m, lat: 38.1140, lng: 13.3660);
        AddItem(d8, ItineraryItemType.Lodging, "Check in · Casa 3 Cupole (€240 cash)", "Palermo",
            new TimeOnly(15, 0), cost: 240m, conf: "Booking.com", lat: 38.1157, lng: 13.3615,
            bookingUrl: "https://www.booking.com/Share-wpsJWr");

        var d9 = NewDay(trip, 9, new DateOnly(2026, 5, 21), "Sunny", 26, "sun");
        AddItem(d9, ItineraryItemType.Activity, "Palermo Guided Bike Tour + Street Food (3 hrs)", "Palermo",
            new TimeOnly(10, 0), cost: 55m, lat: 38.1157, lng: 13.3615,
            bookingUrl: "https://gyg.me/rPelUxDs");
        AddItem(d9, ItineraryItemType.Transport, "Drive Palermo → Cefalù (1.25 hrs)", "A20",
            new TimeOnly(13, 30), cost: null, lat: 38.0700, lng: 13.7000);
        AddItem(d9, ItineraryItemType.Lodging, "Check in · Sea Sky Suite (washer/dryer)", "Cefalù",
            new TimeOnly(14, 30), cost: null, conf: "Booking.com", lat: 38.0390, lng: 14.0230,
            bookingUrl: "https://www.booking.com/Share-M2HDl7");
        AddItem(d9, ItineraryItemType.Activity, "Wine Tasting @ Villa Toto Resort (2 hrs)", "Cefalù",
            new TimeOnly(15, 50), cost: 35m, lat: 38.0500, lng: 14.0200);
        AddItem(d9, ItineraryItemType.Activity, "Hike La Rocca", "La Rocca di Cefalù",
            new TimeOnly(18, 30), cost: 5m, lat: 38.0380, lng: 14.0250);

        var d10 = NewDay(trip, 10, new DateOnly(2026, 5, 22), "Sunny", 27, "sun");
        AddItem(d10, ItineraryItemType.Activity, "Run the Lungomare waterfront path (3 mi)", "Cefalù seafront",
            new TimeOnly(8, 0), cost: 0m, lat: 38.0370, lng: 14.0190);
        AddItem(d10, ItineraryItemType.Activity, "Chill at the beach", "Cefalù beach",
            new TimeOnly(11, 0), cost: 0m, lat: 38.0360, lng: 14.0210);
        AddItem(d10, ItineraryItemType.Food, "Cooking Class @ Local's Home (location TBD)", "Cefalù",
            new TimeOnly(17, 0), cost: 90m, lat: 38.0390, lng: 14.0230,
            bookingUrl: "https://gyg.me/iJ7YiD6d");
        AddItem(d10, ItineraryItemType.Lodging, "Night 9 · Sea Sky Suite", "Cefalù",
            new TimeOnly(21, 0), cost: null, lat: 38.0390, lng: 14.0230);

        var d11 = NewDay(trip, 11, new DateOnly(2026, 5, 23), "Sunny", 25, "sun");
        AddItem(d11, ItineraryItemType.Transport, "Drive Cefalù → Milazzo (1.75 hrs), park guarded lot", "Parcheggio custodito, Milazzo",
            new TimeOnly(10, 30), cost: null, lat: 38.2210, lng: 15.2410);
        AddItem(d11, ItineraryItemType.Transport, "Ferry Milazzo → Lipari (Liberty Lines, 50 min)", "Milazzo port",
            new TimeOnly(14, 0), cost: 25m, lat: 38.2190, lng: 15.2390);
        AddItem(d11, ItineraryItemType.Lodging, "Check in · Casa Eolie (€60 cash, washer)", "Lipari",
            new TimeOnly(15, 0), cost: 60m, conf: "Booking.com", lat: 38.4680, lng: 14.9530,
            bookingUrl: "https://www.booking.com/Share-OI2mjpi");
        AddItem(d11, ItineraryItemType.Activity, "Maybe sunset wine @ Tenuta di Castellaro", "Lipari",
            new TimeOnly(19, 0), cost: 30m, lat: 38.4850, lng: 14.9300,
            bookingUrl: "https://www.tenutadicastellaro.it/en/experiences-and-tastings/");

        var d12 = NewDay(trip, 12, new DateOnly(2026, 5, 24), "Sunny", 25, "sun");
        AddItem(d12, ItineraryItemType.Activity, "Scuba Dive · La Gorgonia Diving Center", "Lipari",
            new TimeOnly(8, 30), cost: 110m, lat: 38.4670, lng: 14.9540,
            bookingUrl: "https://www.liparidiving.com/");
        AddItem(d12, ItineraryItemType.Lodging, "Night 11 · Casa Eolie", "Lipari",
            new TimeOnly(21, 0), cost: null, lat: 38.4680, lng: 14.9530);

        var d13 = NewDay(trip, 13, new DateOnly(2026, 5, 25), "Clear", 24, "sun");
        AddItem(d13, ItineraryItemType.Transport, "Ferry Lipari → Stromboli (via Panarea, 2 hrs)", "Lipari port",
            new TimeOnly(8, 45), cost: 30m, lat: 38.4680, lng: 14.9530);
        AddItem(d13, ItineraryItemType.Lodging, "Check in · La Sirenetta Park Hotel", "Stromboli",
            new TimeOnly(13, 0), cost: null, conf: "Booking.com", lat: 38.7930, lng: 15.2130,
            bookingUrl: "https://www.booking.com/Share-DOg1jb");
        AddItem(d13, ItineraryItemType.Activity, "Sunset / night hike · Magmatrek", "Stromboli volcano",
            new TimeOnly(16, 45), cost: 60m, lat: 38.7890, lng: 15.2110,
            bookingUrl: "https://www.magmatrek.it/en/stromboli-volcano-island/");

        var d14 = NewDay(trip, 14, new DateOnly(2026, 5, 26), "Sunny", 26, "sun");
        AddItem(d14, ItineraryItemType.Transport, "Ferry Stromboli → Milazzo (3 hrs)", "Stromboli port",
            new TimeOnly(9, 0), cost: 35m, lat: 38.7930, lng: 15.2130);
        AddItem(d14, ItineraryItemType.Transport, "Drive Milazzo → Taormina (1 hr)", "A18",
            new TimeOnly(13, 0), cost: null, lat: 37.9000, lng: 15.2900);
        AddItem(d14, ItineraryItemType.Lodging, "Check in · Dieffe Apartment (washer)", "Taormina",
            new TimeOnly(15, 0), cost: null, conf: "Booking.com", lat: 37.8520, lng: 15.2870,
            bookingUrl: "https://www.booking.com/hotel/it/dieffe-apartment.html");
        AddItem(d14, ItineraryItemType.Activity, "Maybe sunset in Castelmola (8:11 pm)", "Castelmola",
            new TimeOnly(20, 0), cost: 0m, lat: 37.8640, lng: 15.2810);

        var d15 = NewDay(trip, 15, new DateOnly(2026, 5, 27), "Sunny", 24, "sun");
        AddItem(d15, ItineraryItemType.Activity, "North Mount Etna Hike with Lunch & Wine", "North Etna",
            new TimeOnly(8, 30), cost: 95m, lat: 37.7700, lng: 15.0000,
            bookingUrl: "https://gyg.me/JxwnpRmV");
        AddItem(d15, ItineraryItemType.Activity, "Ancient Greek Theater (latest entry)", "Teatro Antico di Taormina",
            new TimeOnly(18, 30), cost: 15m, lat: 37.8526, lng: 15.2920);

        var d16 = NewDay(trip, 16, new DateOnly(2026, 5, 28), "Sunny", 25, "sun");
        AddItem(d16, ItineraryItemType.Activity, "EtnaRunWalk @ Etna Sur", "South Etna (Rifugio Sapienza)",
            new TimeOnly(8, 0), cost: 50m, lat: 37.6990, lng: 14.9990,
            bookingUrl: "https://gyg.me/aH2O8vmh");
        AddItem(d16, ItineraryItemType.Activity, "White Lotus Tour (2 hrs on boat)", "Taormina bay",
            new TimeOnly(16, 0), cost: 80m, lat: 37.8500, lng: 15.3000,
            bookingUrl: "https://gyg.me/DlVL1nub");
        AddItem(d16, ItineraryItemType.Food, "Final cocktail · San Domenico Palace (Bar & Chiostro)", "Taormina",
            new TimeOnly(20, 30), cost: 40m, lat: 37.8512, lng: 15.2880);

        var d17 = NewDay(trip, 17, new DateOnly(2026, 5, 29), "Travel day", 23, "cloud-sun");
        AddItem(d17, ItineraryItemType.Transport, "Leave for Catania airport (7 am)", "Taormina → CTA",
            new TimeOnly(7, 0), cost: null, lat: 37.8520, lng: 15.2870);
        AddItem(d17, ItineraryItemType.Flight, "DL0245 Catania → JFK", "Catania-Fontanarossa (CTA)",
            new TimeOnly(9, 55), cost: null, conf: "DL0245", lat: 37.4668, lng: 15.0664);
        AddItem(d17, ItineraryItemType.Flight, "DL4914 JFK → Indianapolis", "JFK International, New York",
            new TimeOnly(18, 20), cost: null, conf: "DL4914", lat: 40.6413, lng: -73.7781);

        AddPacking(d1, "Passports + Real ID");
        AddPacking(d1, "Delta boarding passes");
        AddPacking(d1, "Rental car (Alamo) confirmation");
        AddPacking(d1, "EU plug adapters");
        AddPacking(d1, "Swimsuits + beach towel");
        AddPacking(d1, "Hiking shoes (Etna/Stromboli)");
        AddPacking(d1, "Cash: €240 (Palermo) + €60 (Lipari)");
        AddPacking(d1, "Sunscreen + hat");

        return trip;
    }

    private static Trip Lisbon()
    {
        var trip = new Trip
        {
            Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            OwnerId = "demo-user",
            Title = "Lisbon, Portugal",
            Destination = "Lisbon, Portugal",
            StartDate = new DateOnly(2026, 6, 10),
            EndDate = new DateOnly(2026, 6, 14),
            Travelers = 1,
            CoverTheme = "lisbon",
            EstimatedCost = 620m,
            Currency = "EUR"
        };

        var day1 = NewDay(trip, 1, new DateOnly(2026, 6, 10), "Sunny", 27, "sun");
        AddItem(day1, ItineraryItemType.Lodging, "Check in · Casa do Bairro", "Alfama, Lisbon",
            new TimeOnly(15, 0), cost: null, conf: "BK2291", lat: 38.7128, lng: -9.1304);
        AddItem(day1, ItineraryItemType.Food, "Dinner · Time Out Market", "Cais do Sodré, Lisbon",
            new TimeOnly(19, 30), cost: 25m, lat: 38.7072, lng: -9.1459);

        var day2 = NewDay(trip, 2, new DateOnly(2026, 6, 11), "Partly cloudy", 24, "cloud-sun");
        AddItem(day2, ItineraryItemType.Activity, "Belém Tower & Jerónimos", "Belém, Lisbon",
            new TimeOnly(10, 0), cost: 18m, lat: 38.6916, lng: -9.2160);
        AddItem(day2, ItineraryItemType.Food, "Pastéis de Belém", "Belém, Lisbon",
            new TimeOnly(12, 30), cost: 8m, lat: 38.6975, lng: -9.2032);
        AddItem(day2, ItineraryItemType.Activity, "Fado show", "Alfama, Lisbon",
            new TimeOnly(19, 30), cost: 30m, lat: 38.7115, lng: -9.1290,
            bookingUrl: "https://www.getyourguide.com/lisbon-l42/fado-show");

        var day3 = NewDay(trip, 3, new DateOnly(2026, 6, 12), "Sunny", 28, "sun");
        AddItem(day3, ItineraryItemType.Activity, "Miradouro da Senhora do Monte", "Graça, Lisbon",
            new TimeOnly(10, 30), cost: 0m, lat: 38.7197, lng: -9.1300);
        AddItem(day3, ItineraryItemType.Food, "Lunch · Mercado de Campo de Ourique", "Campo de Ourique",
            new TimeOnly(13, 0), cost: 20m, lat: 38.7156, lng: -9.1660);

        var day4 = NewDay(trip, 4, new DateOnly(2026, 6, 13), "Sunny", 29, "sun");
        AddItem(day4, ItineraryItemType.Activity, "Day trip · Sintra", "Sintra",
            new TimeOnly(9, 0), cost: 45m, lat: 38.7979, lng: -9.3907);

        return trip;
    }

    private static Trip Kyoto()
    {
        var trip = new Trip
        {
            Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
            OwnerId = "demo-user",
            Title = "Kyoto, Japan",
            Destination = "Kyoto, Japan",
            StartDate = new DateOnly(2026, 8, 3),
            EndDate = new DateOnly(2026, 8, 9),
            Travelers = 1,
            CoverTheme = "kyoto",
            EstimatedCost = 1450m,
            Currency = "USD"
        };

        var d1 = NewDay(trip, 1, new DateOnly(2026, 8, 3), "Humid", 33, "sun");
        AddItem(d1, ItineraryItemType.Lodging, "Check in · Ryokan Shiraume", "Gion, Kyoto",
            new TimeOnly(15, 0), cost: null, conf: "RY8841", lat: 35.0036, lng: 135.7788);
        AddItem(d1, ItineraryItemType.Activity, "Evening walk · Gion", "Gion, Kyoto",
            new TimeOnly(18, 30), cost: 0m, lat: 35.0037, lng: 135.7754);

        var d2 = NewDay(trip, 2, new DateOnly(2026, 8, 4), "Sunny", 34, "sun");
        AddItem(d2, ItineraryItemType.Activity, "Fushimi Inari Shrine", "Fushimi, Kyoto",
            new TimeOnly(8, 0), cost: 0m, lat: 34.9671, lng: 135.7727);

        return trip;
    }

    private static Trip SwissAlps()
    {
        var trip = new Trip
        {
            Id = Guid.Parse("33333333-3333-3333-3333-333333333333"),
            OwnerId = "demo-user",
            Title = "Swiss Alps",
            Destination = "Interlaken, Switzerland",
            StartDate = new DateOnly(2026, 3, 1),
            EndDate = new DateOnly(2026, 3, 5),
            Travelers = 1,
            CoverTheme = "alps",
            EstimatedCost = 1800m,
            Currency = "CHF"
        };

        var d1 = NewDay(trip, 1, new DateOnly(2026, 3, 1), "Snow", -3, "snow");
        AddItem(d1, ItineraryItemType.Activity, "Jungfraujoch railway", "Interlaken",
            new TimeOnly(9, 0), cost: 210m, lat: 46.5474, lng: 7.9856);

        return trip;
    }

    /// <summary>Adds an unscheduled "idea" to the trip backlog (no day, no time).</summary>
    private static void AddWishlist(Trip trip, ItineraryItemType type, string title, string location,
        ItineraryItemStatus status = ItineraryItemStatus.Wishlist, decimal? cost = null,
        double? lat = null, double? lng = null)
    {
        trip.UnscheduledItems.Add(new ItineraryItem
        {
            TripId = trip.Id,
            DayId = null,
            OwnerId = trip.OwnerId,
            Type = type,
            Status = status,
            Title = title,
            LocationName = location,
            Cost = cost,
            Latitude = lat,
            Longitude = lng,
            SortOrder = trip.UnscheduledItems.Count
        });
    }

    private static Day NewDay(Trip trip, int number, DateOnly date, string weather, int highC, string icon)
    {
        var day = new Day
        {
            TripId = trip.Id,
            OwnerId = trip.OwnerId,
            DayNumber = number,
            Date = date,
            WeatherSummary = weather,
            WeatherHighC = highC,
            WeatherIcon = icon
        };
        trip.Days.Add(day);
        return day;
    }

    private static void AddItem(Day day, ItineraryItemType type, string title, string location,
        TimeOnly start, decimal? cost, string? conf = null, double? lat = null, double? lng = null,
        string? bookingUrl = null)
    {
        day.Items.Add(new ItineraryItem
        {
            DayId = day.Id,
            OwnerId = day.OwnerId,
            Type = type,
            Title = title,
            LocationName = location,
            StartTime = start,
            Cost = cost,
            ConfirmationNo = conf,
            BookingUrl = bookingUrl,
            Latitude = lat,
            Longitude = lng,
            SortOrder = day.Items.Count
        });
    }

    private static void AddPacking(Day day, string name)
    {
        day.PackingItems.Add(new PackingItem
        {
            DayId = day.Id,
            OwnerId = day.OwnerId,
            Name = name,
            IsPacked = false
        });
    }
}
