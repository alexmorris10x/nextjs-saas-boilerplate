export interface WaitlistData {
  email: string;
  product: string | null;
  source: string;
}

export interface WaitlistRepository {
  ensureSignup(data: WaitlistData): Promise<{ id: string; confirmationSentAt: Date | null }>;
  claimConfirmation(id: string, token: string, now: Date, staleBefore: Date): Promise<boolean>;
  markConfirmationSent(id: string, token: string, now: Date): Promise<void>;
  releaseConfirmation(id: string, token: string): Promise<void>;
}

export function createWaitlistRateLimiter(options?: {
  now?: () => number;
  windowMs?: number;
  perClient?: number;
  total?: number;
  maxClients?: number;
}): (client: string) => { allowed: boolean; retryAfter: number };

export function createWaitlistHandler(options: {
  enabled: () => boolean;
  repository: WaitlistRepository;
  sendEmail: (to: string, subject: string, html: string, text: string) => Promise<void>;
  appName?: string;
  limit?: ReturnType<typeof createWaitlistRateLimiter>;
  now?: () => Date;
  newToken?: () => string;
  onError?: (error: unknown) => void;
}): (request: Request) => Promise<Response>;
