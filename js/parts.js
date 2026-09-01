// A part is a component written as an HTML file.
//
//   parts/search-row.html   is mounted by   <search-row x-data="{ row: result }"></search-row>
//
// The custom element only injects the file's markup into itself. It uses no shadow DOM,
// so styles.css still reaches the markup and Alpine still initialises it: the directives
// inside the file read the x-data on the tag, which is how a part receives its props.
// Each file says at the top which names it expects.
//
// A part that changes a show takes its id and reads the record back from the store: see
// card.js for why a record cannot be handed down through x-data.
export const defineParts = names => Promise.all(names.map(async name => {
  const markup = await fetch(`parts/${name}.html`).then(response => response.text());

  customElements.define(name, class extends HTMLElement {
    // x-for moves nodes about, which reconnects them; the markup goes in once.
    connectedCallback(){
      if (!this.children.length) this.innerHTML = markup;
    }
  });
}));
