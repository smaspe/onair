import { searchTv } from "./tmdb.js";

// The search bar and the sheet of results under it.
export const search = () => ({
  query: "",
  results: [],
  note: "",

  async run() {
    const query = this.query.trim();
    if (!query) return this.close();

    this.results = [];
    this.note = "Searching…";
    try {
      this.results = await searchTv(query);
      this.note = "No matches.";
    } catch {
      this.note = "Search failed. Try again.";
    }
  },

  close() {
    this.results = [];
    this.note = "";
  },
});
