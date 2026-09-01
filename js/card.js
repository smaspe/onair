// The props of a card that can change the show it shows.
//
// A record must be reached through the store, never handed down from an x-for: Alpine
// gives the child scope a copy of the loop item, so writes to it render and are then lost.
// The id travels instead, and the record is read back from the store on every access.
export const card = (id, airDates = false) => ({
  id,
  airDates,

  get show(){ return this.$store.library.shows[this.id]; }
});
