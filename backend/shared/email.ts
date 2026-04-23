import nodemailer from "nodemailer";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  ignoreTLS: boolean;
  requireTLS: boolean;
  rejectUnauthorized: boolean;
  user?: string;
  pass?: string;
  from: string;
}

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedConfigKey: string | null = null;

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function getEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const from = process.env.SMTP_FROM?.trim();

  if (!host || !portRaw || !from) {
    return null;
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    return null;
  }

  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const ignoreTLS = parseBooleanEnv(process.env.SMTP_IGNORE_TLS) ?? false;
  const requireTLS = parseBooleanEnv(process.env.SMTP_REQUIRE_TLS) ?? false;
  const rejectUnauthorized = parseBooleanEnv(process.env.SMTP_TLS_REJECT_UNAUTHORIZED) ?? true;

  return {
    host,
    port,
    secure,
    ignoreTLS,
    requireTLS,
    rejectUnauthorized,
    user: process.env.SMTP_USER?.trim() || undefined,
    pass: process.env.SMTP_PASS?.trim() || undefined,
    from,
  };
}

function getTransporter(config: EmailConfig): nodemailer.Transporter {
  const configKey = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ignoreTLS: config.ignoreTLS,
    requireTLS: config.requireTLS,
    rejectUnauthorized: config.rejectUnauthorized,
    user: config.user,
    from: config.from,
  });

  if (!cachedTransporter || cachedConfigKey !== configKey) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ignoreTLS: config.ignoreTLS,
      requireTLS: config.requireTLS,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      tls: {
        rejectUnauthorized: config.rejectUnauthorized,
      },
    });
    cachedConfigKey = configKey;
  }

  return cachedTransporter;
}

export async function sendNotificationEmail(payload: EmailPayload): Promise<boolean> {
  const config = getEmailConfig();
  if (!config) {
    return false;
  }

  try {
    const transporter = getTransporter(config);
    await transporter.sendMail({
      from: config.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    return true;
  } catch (error) {
    console.warn("SMTP email send failed", error);
    return false;
  }
}
