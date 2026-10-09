/** Build a transactional sender around Postmark, injectable for offline tests. */
export function createPostmarkSender({ client, from }) {
  return async function sendEmail(to, subject, htmlBody, textBody = "") {
    if (!client || !from) {
      throw new Error("Postmark server token and sender must be configured");
    }

    await client.sendEmail({
      From: from,
      To: to,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody,
    });
  };
}
