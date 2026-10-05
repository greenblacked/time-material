export type CityOption = {
  zone: string;
  label: string;
  region: string;
};

export const CITIES: readonly CityOption[] = [
  { zone: "Europe/Kyiv", label: "Kyiv", region: "Ukraine" },
  { zone: "Europe/London", label: "London", region: "United Kingdom" },
  { zone: "America/New_York", label: "New York", region: "United States" },
  { zone: "America/Los_Angeles", label: "Los Angeles", region: "United States" },
  { zone: "America/Chicago", label: "Chicago", region: "United States" },
  { zone: "America/Denver", label: "Denver", region: "United States" },
  { zone: "America/Toronto", label: "Toronto", region: "Canada" },
  { zone: "America/Vancouver", label: "Vancouver", region: "Canada" },
  { zone: "America/Mexico_City", label: "Mexico City", region: "Mexico" },
  { zone: "America/Sao_Paulo", label: "São Paulo", region: "Brazil" },
  { zone: "America/Buenos_Aires", label: "Buenos Aires", region: "Argentina" },
  { zone: "Europe/Lisbon", label: "Lisbon", region: "Portugal" },
  { zone: "Europe/Madrid", label: "Madrid", region: "Spain" },
  { zone: "Europe/Paris", label: "Paris", region: "France" },
  { zone: "Europe/Berlin", label: "Berlin", region: "Germany" },
  { zone: "Europe/Amsterdam", label: "Amsterdam", region: "Netherlands" },
  { zone: "Europe/Rome", label: "Rome", region: "Italy" },
  { zone: "Europe/Zurich", label: "Zurich", region: "Switzerland" },
  { zone: "Europe/Vienna", label: "Vienna", region: "Austria" },
  { zone: "Europe/Warsaw", label: "Warsaw", region: "Poland" },
  { zone: "Europe/Prague", label: "Prague", region: "Czechia" },
  { zone: "Europe/Stockholm", label: "Stockholm", region: "Sweden" },
  { zone: "Europe/Helsinki", label: "Helsinki", region: "Finland" },
  { zone: "Europe/Athens", label: "Athens", region: "Greece" },
  { zone: "Europe/Bucharest", label: "Bucharest", region: "Romania" },
  { zone: "Europe/Istanbul", label: "Istanbul", region: "Türkiye" },
  { zone: "Asia/Dubai", label: "Dubai", region: "United Arab Emirates" },
  { zone: "Asia/Jerusalem", label: "Jerusalem", region: "Israel" },
  { zone: "Africa/Cairo", label: "Cairo", region: "Egypt" },
  { zone: "Africa/Johannesburg", label: "Johannesburg", region: "South Africa" },
  { zone: "Africa/Lagos", label: "Lagos", region: "Nigeria" },
  { zone: "Asia/Kolkata", label: "Kolkata", region: "India" },
  { zone: "Asia/Karachi", label: "Karachi", region: "Pakistan" },
  { zone: "Asia/Bangkok", label: "Bangkok", region: "Thailand" },
  { zone: "Asia/Singapore", label: "Singapore", region: "Singapore" },
  { zone: "Asia/Hong_Kong", label: "Hong Kong", region: "Hong Kong" },
  { zone: "Asia/Shanghai", label: "Shanghai", region: "China" },
  { zone: "Asia/Taipei", label: "Taipei", region: "Taiwan" },
  { zone: "Asia/Seoul", label: "Seoul", region: "South Korea" },
  { zone: "Asia/Tokyo", label: "Tokyo", region: "Japan" },
  { zone: "Australia/Sydney", label: "Sydney", region: "Australia" },
  { zone: "Pacific/Auckland", label: "Auckland", region: "New Zealand" },
  { zone: "Pacific/Honolulu", label: "Honolulu", region: "United States" },
];

export function cityByZone(zone: string): CityOption | undefined {
  return CITIES.find((city) => city.zone === zone);
}

export function labelFromZone(zone: string): string {
  return cityByZone(zone)?.label ?? (zone.split("/").pop() ?? zone).replaceAll("_", " ");
}
