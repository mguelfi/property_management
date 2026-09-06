// Shared sample data for the front-desk mockups.
// Fixed dates (not Date.now()-derived) so every mockup renders identically on any day.
window.MOCK_DATA = {
  today: "2026-09-06",
  arrivals: [
    {
      id: 1,
      reference: "RES-1042",
      guest: "Elena Marchetti",
      arrival: "2026-09-06",
      departure: "2026-09-09",
      roomsCount: 1,
      unassignedRooms: 1,
      notes: "Late arrival ~9pm",
    },
    {
      id: 2,
      reference: "RES-1043",
      guest: "David & Priya Nair",
      arrival: "2026-09-06",
      departure: "2026-09-08",
      roomsCount: 1,
      unassignedRooms: 0,
      assignedRoom: "204",
    },
    {
      id: 3,
      reference: "RES-1044",
      guest: "Marcus Webb",
      arrival: "2026-09-06",
      departure: "2026-09-13",
      roomsCount: 2,
      unassignedRooms: 2,
      notes: "Corporate account – Whitfield & Co",
    },
    {
      id: 4,
      reference: "RES-1045",
      guest: "Sofia Alvarez",
      arrival: "2026-09-06",
      departure: "2026-09-07",
      roomsCount: 1,
      unassignedRooms: 0,
      assignedRoom: "112",
    },
    {
      id: 5,
      reference: "RES-1046",
      guest: "Tom O'Brien",
      arrival: "2026-09-06",
      departure: "2026-09-10",
      roomsCount: 1,
      unassignedRooms: 1,
    },
  ],
  inHouse: [
    {
      id: 6,
      reference: "RES-1030",
      guest: "Grace Kim",
      room: "301",
      departure: "2026-09-08",
      balanceMinor: 0,
      currency: "USD",
    },
    {
      id: 7,
      reference: "RES-1031",
      guest: "Ahmed Hassan",
      room: "205",
      departure: "2026-09-06",
      balanceMinor: 4200,
      currency: "USD",
    },
    {
      id: 8,
      reference: "RES-1032",
      guest: "Linda Park",
      room: "118",
      departure: "2026-09-09",
      balanceMinor: 0,
      currency: "USD",
    },
    {
      id: 9,
      reference: "RES-1033",
      guest: "Carlos Mendes",
      room: "402",
      departure: "2026-09-06",
      balanceMinor: 15000,
      currency: "USD",
    },
  ],
  roomTypes: [
    {
      id: 1,
      name: "Standard Queen",
      unitsAvailable: 4,
      ratePlans: [
        { id: 1, name: "Best Available Rate", totalMinor: 24000, currency: "USD", sellable: true },
        { id: 2, name: "Non-refundable", totalMinor: 20400, currency: "USD", sellable: true },
      ],
    },
    {
      id: 2,
      name: "Deluxe King",
      unitsAvailable: 2,
      ratePlans: [
        { id: 3, name: "Best Available Rate", totalMinor: 32000, currency: "USD", sellable: true },
      ],
    },
    {
      id: 3,
      name: "Suite",
      unitsAvailable: 0,
      ratePlans: [
        { id: 4, name: "Best Available Rate", totalMinor: 52000, currency: "USD", sellable: false },
      ],
    },
  ],
};

// departures = in-house guests leaving today
window.MOCK_DATA.departures = window.MOCK_DATA.inHouse.filter(
  (r) => r.departure === window.MOCK_DATA.today,
);

window.formatMoney = function formatMoney(minor, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
};

window.fmtDate = function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
