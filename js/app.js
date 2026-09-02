// Pinned: a version range is served with a ten minute cache, an exact one for a year.
import Alpine from "https://esm.sh/alpinejs@3.17.0";
import { library } from "./library.js";
import { recommended } from "./recommended.js";
import { search } from "./search.js";
import { droppedList } from "./dropped-list.js";
import { transfer } from "./transfer.js";
import { card } from "./card.js";
import { display } from "./display.js";
import { defineParts } from "./parts.js";

// Each name is a tag and a file: <show-card> is parts/show-card.part.html.
// They load before Alpine starts, so the first paint has the markup it needs.
await defineParts([
  "show-card",
  "dropped-card",
  "search-row",
  "suggestion-card",
  "star-rating",
  "add-button",
]);

Alpine.magic("display", () => display);
Alpine.store("library", library);
Alpine.store("recommended", recommended);
Alpine.data("search", search);
Alpine.data("droppedList", droppedList);
Alpine.data("transfer", transfer);
Alpine.data("card", card);

Alpine.start();

// Suggestions cost a request per show you watch, so they are read once the view is opened.
// A suggestion names the shows it comes from, so it waits for those shows to have names.
const openRecommended = async () => {
  if (location.hash !== "#recommended") return;
  const shows = Alpine.store("library");
  await shows.ready;
  Alpine.store("recommended").load(shows.shows);
};

addEventListener("hashchange", openRecommended);
openRecommended();
