import { exportWatched, readBackup } from "./storage.js";

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

  // The file adds to what this browser tracks.
  async open(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    try {
      const watched = readBackup(await file.text());
      this.note = "reading their episodes…";
      const added = await this.$store.library.absorb(watched);
      this.note = `${added} shows added`;
    } catch (failure) {
      this.note = failure.message;
    }
  },
});
