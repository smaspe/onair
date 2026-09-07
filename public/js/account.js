import { client } from "./supabase.js";

// Who is signed in, and the two ways to change that. Alpine reads it as x-data="account".
export const account = () => ({
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

  async signOut() {
    const { error } = await (await client()).auth.signOut();
    this.report(error);
  },

  // Supabase answers with an error instead of throwing one.
  report(error) {
    this.note = error ? error.message : "";
    this.password = "";
  },
});
