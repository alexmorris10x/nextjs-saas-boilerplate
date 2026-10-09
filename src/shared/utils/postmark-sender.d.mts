export interface PostmarkSenderOptions {
  client: {
    sendEmail(message: {
      From: string;
      To: string;
      Subject: string;
      HtmlBody: string;
      TextBody: string;
    }): Promise<unknown>;
  } | null;
  from?: string;
}

export function createPostmarkSender(options: PostmarkSenderOptions): (
  to: string,
  subject: string,
  htmlBody: string,
  textBody?: string
) => Promise<void>;
