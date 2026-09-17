import { client } from "./supabase.js";
import { library } from "./library.js";

// Who is signed in, and the two ways to change that. Alpine reaches it as $store.account.
// The masthead and the sign-in dialog both read it, and they sit in different places on the
// page because a dialog cannot draw from inside a sticky header.
export const account = {
  email: "",
  password: "",
  note: "",
  user: null,

  async init() {
    const auth = (await client()).auth;
    // This runs once with the session read back from storage, which is what keeps a reload
    // signed in, and again on every sign in and sign out.
    auth.onAuthStateChange((_, session) => {
      this.user = session?.user ?? null;
    });
  },

  async signIn() {
    const { error } = await (await client()).auth.signInWithPassword({
      email: this.email,
      password: this.password,
    });
    this.report(error);
  },

  async signUp() {
    const { data, error } = await (await client()).auth.signUp({
      email: this.email,
      password: this.password,
    });
    this.report(error);

    // A project that asks for email confirmation makes the account but hands back no session.
    // The person is not signed in yet, and only the mail says so.
    if (!error && !data.session)
      this.note = "check your email for the confirmation link";
  },

  // The shelf is cleared here rather than on every session that reports nobody, because a
  // reader who never signed in also reports nobody and their library is their own.
  async signOut() {
    const { error } = await (await client()).auth.signOut();
    if (!error) library.forget();
    this.report(error);
  },

  // Supabase answers with an error instead of throwing one.
  report(error) {
    this.note = error ? error.message : "";
    this.password = "";
  },
};
