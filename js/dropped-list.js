// The dropped view. A delete throws the progress away, so it takes a second click.
export const droppedList = () => ({
  pending: null,

  armed(id){ return this.pending === id; },

  press(id){
    if (this.pending === id){
      this.$store.library.remove(id);
      this.pending = null;
    } else {
      this.pending = id;
    }
  }
});
