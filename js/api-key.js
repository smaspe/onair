import { getApiKey, setApiKey } from "./storage.js";

// The TMDB key form in the header.
export const apiKey = () => ({
  open: !getApiKey(),
  value: "",

  save() {
    const key = this.value.trim();
    if (!key) return;
    setApiKey(key);
    this.value = "";
    this.open = false;
  },
});
