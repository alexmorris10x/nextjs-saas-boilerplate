// One public build-time flag controls the form and its anonymous API together.
// Enable it only after configuring the database and Postmark sender.
export const waitlistConfig = {
  enabled: process.env.NEXT_PUBLIC_WAITLIST_ENABLED === "true",
};
