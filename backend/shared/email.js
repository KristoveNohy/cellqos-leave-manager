import nodemailer from "nodemailer";
let cachedTransporter = null;
let cachedConfigKey = null;
let missingEmailConfigWarned = false;
function parseBooleanEnv(value) {
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
function getEmailConfig() {
    const host = process.env.SMTP_HOST?.trim();
    const portRaw = process.env.SMTP_PORT?.trim();
    const from = process.env.SMTP_FROM?.trim();
    if (!host || !portRaw || !from) {
        if (!missingEmailConfigWarned) {
            console.warn("SMTP email disabled: missing SMTP_HOST, SMTP_PORT, or SMTP_FROM");
            missingEmailConfigWarned = true;
        }
        return null;
    }
    const port = Number(portRaw);
    if (!Number.isFinite(port)) {
        if (!missingEmailConfigWarned) {
            console.warn("SMTP email disabled: SMTP_PORT is not a valid number");
            missingEmailConfigWarned = true;
        }
        return null;
    }
    missingEmailConfigWarned = false;
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
function getTransporter(config) {
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
        console.warn("SMTP email send failed", {
            host: config.host,
            port: config.port,
            secure: config.secure,
            ignoreTLS: config.ignoreTLS,
            requireTLS: config.requireTLS,
            rejectUnauthorized: config.rejectUnauthorized,
            hasAuth: Boolean(config.user && config.pass),
            error,
        });
        return false;
    }
}
//# sourceMappingURL=email.js.map
