import { exportWatched, importWatched } from "./storage.js";

const filename = () => `onair-${new Date().toISOString().slice(0, 10)}.json`;

// Carrying the watch data out of this browser and back into another one.
export const transfer = () => ({
  note: "",

  save() {
    const url = URL.createObjectURL(
      new Blob([exportWatched()], { type: "application/json" }),
    );
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: filename(),
    });
    link.click();
    URL.revokeObjectURL(url);
    this.note = filename();
  },

  // The file replaces what this browser tracks, so the page starts again from it.
  async open(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    try {
      const shows = importWatched(await file.text());
      this.note = `${shows} shows read, reading their episodes…`;
      location.reload();
    } catch (failure) {
      this.note = `That file is ${failure.message}.`;
    }
  },
});
