import { searchCityPage } from "./world-city-engine.ts";
import type { CitySearchRequest } from "./world-cities.ts";
self.onmessage = (event: MessageEvent<{ id: number; request: CitySearchRequest }>) => {
  void searchCityPage(event.data.request)
    .then((page) => {
      self.postMessage({ id: event.data.id, page });
    })
    .catch(() => {
      self.postMessage({ id: event.data.id, error: "City search unavailable." });
    });
};
