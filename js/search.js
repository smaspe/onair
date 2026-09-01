import { getApiKey } from "./storage.js";
import { searchTv } from "./tmdb.js";

// The search bar and the sheet of results under it.
export const search = () => ({
  query: "",
  results: [],
  note: "",

  async run(){
    const query = this.query.trim();
    if (!query) return this.close();

    this.results = [];
    this.note = "Searching…";
    try {
      this.results = await searchTv(query);
      this.note = "No matches.";
    } catch {
      this.note = getApiKey()
        ? "Search failed. Check your API key and connection."
        : "Add your TMDB API key to search.";
    }
  },

  close(){
    this.results = [];
    this.note = "";
  }
});
