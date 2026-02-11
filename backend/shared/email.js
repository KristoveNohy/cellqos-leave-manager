import nodemailer from "nodemailer";
let cachedTransporter = null;
let cachedConfigKey = null;
function getEmailConfig() {
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
    return {
        host,
        port,
        secure,
        user: process.env.SMTP_USER?.trim() || undefined,
        pass: process.env.SMTP_PASS?.trim() || undefined,
        from,
    };
}
function getTransporter(config) {
    const configKey = JSON.stringify({
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        from: config.from,
    });
    if (!cachedTransporter || cachedConfigKey !== configKey) {
        cachedTransporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
        });
        cachedConfigKey = configKey;
    }
    return cachedTransporter;
}
export async function sendNotificationEmail(payload) {
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
    }
    catch (error) {
        console.warn("SMTP email send failed", error);
        return false;
    }
}
//# sourceMappingURL=email.js.map