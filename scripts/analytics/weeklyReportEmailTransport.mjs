function stringValue(value) {
  return String(value || "").trim();
}

const REQUIRED_SMTP_ENVIRONMENT_NAMES = Object.freeze([
  "WEEKLY_REPORT_SMTP_HOST",
  "WEEKLY_REPORT_SMTP_PORT",
  "WEEKLY_REPORT_SMTP_SECURE",
  "WEEKLY_REPORT_SMTP_USER",
  "WEEKLY_REPORT_SMTP_PASSWORD",
  "WEEKLY_REPORT_FROM",
  "WEEKLY_REPORT_TO",
]);

export function parseWeeklyReportRecipients(value) {
  const recipients = [];
  const seen = new Set();
  String(value || "").split(",").forEach((entry) => {
    const address = stringValue(entry);
    if (!address) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("weekly_report_smtp_recipient_invalid");
    const key = address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      recipients.push(address);
    }
  });
  if (!recipients.length) throw new Error("weekly_report_smtp_recipient_missing");
  return recipients;
}

function parseBoolean(value) {
  const normalized = stringValue(value).toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  throw new Error("weekly_report_smtp_secure_invalid");
}

export function getWeeklyReportSmtpConfig(environment = process.env) {
  const values = Object.fromEntries(REQUIRED_SMTP_ENVIRONMENT_NAMES.map((name) => [name, stringValue(environment?.[name])]));
  const missing = REQUIRED_SMTP_ENVIRONMENT_NAMES.filter((name) => !values[name]);
  if (missing.length) throw new Error(`weekly_report_smtp_configuration_missing:${missing.join(",")}`);
  const port = Number(values.WEEKLY_REPORT_SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("weekly_report_smtp_port_invalid");
  return {
    host: values.WEEKLY_REPORT_SMTP_HOST,
    port,
    secure: parseBoolean(values.WEEKLY_REPORT_SMTP_SECURE),
    user: values.WEEKLY_REPORT_SMTP_USER,
    password: values.WEEKLY_REPORT_SMTP_PASSWORD,
    from: values.WEEKLY_REPORT_FROM,
    recipients: parseWeeklyReportRecipients(values.WEEKLY_REPORT_TO),
  };
}

async function defaultCreateTransport(options) {
  const module = await import("nodemailer");
  return module.default.createTransport(options);
}

/** Sends exactly one multipart email. SMTP credentials never leave this module. */
export async function sendWeeklyReportEmail({ config, subject, html, text, createTransport = defaultCreateTransport }) {
  const transporter = await createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
  if (!transporter || typeof transporter.sendMail !== "function") throw new Error("weekly_report_smtp_transport_invalid");
  await transporter.sendMail({
    from: config.from,
    to: config.recipients,
    subject: String(subject || ""),
    html: String(html || ""),
    text: String(text || ""),
  });
  return { recipientCount: config.recipients.length };
}
