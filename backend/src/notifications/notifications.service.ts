import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { ago } from '../jobs/jobs.service.js';
import { ReadNotifications } from './dto/ReadNotifications.dto.js';
import { NotificationsRepository } from './notifications.repository.js';

@Injectable()
export class NotificationsService {
    constructor(
        private readonly notificationsRepository: NotificationsRepository,
        private readonly authService: AuthService,
    ) {}

    async getNotifications(token: string) {
        const authId = await this.authId(token);
        const rows = await this.notificationsRepository.getNotifications(authId);
        return {
            unread: rows.filter((r) => !r.read).length,
            items: rows.map((r) => ({
                id: r.id,
                kind: r.kind,
                text: r.body ? `${r.title}: ${r.body}` : r.title,
                link: r.link,
                time: ago(r.createdAt),
                read: r.read,
            })),
        };
    }

    async readNotifications(token: string, body: ReadNotifications) {
        const authId = await this.authId(token);
        const count = await this.notificationsRepository.readNotifications(authId, body.ids?.length ? body.ids : null);
        return { message: 'Notifications Successfully Read', count };
    }

    private async authId(token: string): Promise<string> {
        return this.authService.verifySessionToken((token ?? '').replace('Bearer ', ''));
    }
}
