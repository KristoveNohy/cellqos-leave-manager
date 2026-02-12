interface EmailPayload {
    to: string;
    subject: string;
    text: string;
}
export declare function sendNotificationEmail(payload: EmailPayload): Promise<boolean>;
export {};
