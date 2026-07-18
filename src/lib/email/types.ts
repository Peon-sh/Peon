export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface EmailDriver {
  send(message: EmailMessage): Promise<void>;
}
