import nodemailer from 'nodemailer';
import { config } from './config.js';

const { smtp } = config;
const transport = smtp.host
  ? nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

// Sin SMTP los correos quedan aquí (lo usan las pruebas) y se imprimen en el log.
export const outbox = [];

export async function sendMail({ to, subject, text }) {
  await transport.sendMail({ from: smtp.from, to, subject, text });
  if (!smtp.host) {
    outbox.push({ to, subject, text });
    if (outbox.length > 50) outbox.shift();
    console.log(`[correo sin SMTP] Para: ${to} | ${subject}\n${text}`);
  }
}
