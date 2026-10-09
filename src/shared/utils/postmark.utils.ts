import { ServerClient } from "postmark";
import { createPostmarkSender } from "./postmark-sender.mjs";

const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_API_TOKEN;
const FROM_EMAIL = process.env.POSTMARK_FROM_EMAIL;

let client: ServerClient | null = null;

if (!POSTMARK_TOKEN) {
  console.warn(
    "Warning: POSTMARK_SERVER_API_TOKEN is not set. Emails will not be sent."
  );
} else {
  // Stay well inside the waitlist's five-minute delivery lease.
  client = new ServerClient(POSTMARK_TOKEN, { timeout: 10 });
}

/**
 * Send transactional email using Postmark.
 * @param to - Recipient's email address
 * @param subject - Email subject
 * @param htmlBody - HTML content of the email
 * @param textBody - Plain text content of the email
 */
export const sendEmail = createPostmarkSender({ client, from: FROM_EMAIL });
