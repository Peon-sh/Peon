import { sendEmail } from '../../src/lib/email/factory';
import type { EmailSendJob } from '../../src/lib/queue/messages';
import { registerHandler } from './index';

registerHandler('email.send', async (message: EmailSendJob, ctx) => {
  ctx.log(`Sending email to ${message.to.join(', ')}: ${message.subject}`);
  await sendEmail({
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    from: message.from,
  });
  ctx.log('Email sent');
});
