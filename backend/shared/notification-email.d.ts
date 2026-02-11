export interface NotificationEmailContent {
    subject: string;
    text: string;
}
export declare function buildNotificationEmail(type: string, payload: any): NotificationEmailContent;
