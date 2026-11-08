import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

jest.mock('../prisma', () => ({ prisma: {} }));

import { InternalKeyGuard } from './internal-key.guard';

const ctx = (key?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: key ? { 'x-internal-key': key } : {} }) }) }) as unknown as ExecutionContext;

describe('InternalKeyGuard', () => {
    beforeAll(() => {
        process.env['AGORA_INTERNAL_KEY'] = 'k'.repeat(32);
    });

    it('accepts the right key and refuses anything else', () => {
        const guard = new InternalKeyGuard();
        expect(guard.canActivate(ctx('k'.repeat(32)))).toBe(true);
        expect(() => guard.canActivate(ctx('wrong'))).toThrow(UnauthorizedException);
        expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
    });
});

describe('InternalController', () => {
    it('passes agent and runner results through to the service', async () => {
        const { Test } = await import('@nestjs/testing');
        const { InternalController } = await import('./internal.controller');
        const { InternalService } = await import('./internal.service');
        const service = { agentNotify: jest.fn().mockResolvedValue({}), runnerResult: jest.fn().mockResolvedValue({}) };
        const module = await Test.createTestingModule({
            controllers: [InternalController],
            providers: [{ provide: InternalService, useValue: service }],
        }).overrideGuard(InternalKeyGuard).useValue({ canActivate: () => true }).compile();
        const controller = module.get(InternalController);
        await controller.agentNotify({ role: 'reviewer' });
        expect(service.agentNotify).toHaveBeenCalledWith({ role: 'reviewer' });
        await controller.runnerResult({ runId: 'r' });
        expect(service.runnerResult).toHaveBeenCalledWith({ runId: 'r' });
    });
});
