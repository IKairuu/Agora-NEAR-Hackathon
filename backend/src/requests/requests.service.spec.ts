jest.mock('../prisma', () => ({ prisma: {} }));

import { AgentsService } from '../agents/agents.service';
import { AuthService } from '../auth/auth.service';
import { RequestsRepository } from './requests.repository';
import { guessCategory, openLimit, RequestsService, sealLimit, titleOf } from './requests.service';

const USER = '0f9b6c1e-4a2d-4c8e-9b1a-7d3e5f6a8b90';
const JOB = '5d2a7c41-3b6e-4f80-a9d1-2c4e6f8a0b13';
const TEXT = "Our payroll contract splits a USDC payment between workers, but the last worker sometimes gets 1 unit too little. Fix it without changing the other tests.";

describe('RequestsService', () => {
    let repo: jest.Mocked<RequestsRepository>;
    let service: RequestsService;
    let agents: jest.Mocked<AgentsService>;

    beforeAll(() => {
        process.env['AGORA_LIMIT_KEY'] = 'a'.repeat(64);
    });

    beforeEach(() => {
        repo = { getService: jest.fn(), getOwnedJob: jest.fn(), createRequests: jest.fn(), editRequest: jest.fn(), keepWaiting: jest.fn() } as unknown as jest.Mocked<RequestsRepository>;
        agents = { dispatch: jest.fn().mockResolvedValue({ status: 'sent' }) } as unknown as jest.Mocked<AgentsService>;
        service = new RequestsService(repo, { verifySessionToken: jest.fn().mockResolvedValue(USER) } as unknown as AuthService, agents);
    });

    it('turns a sentence into a private draft job with a sealed hidden maximum', async () => {
        repo.createRequests.mockResolvedValue([{ id: JOB, ref: 'J-1042' }]);
        await expect(service.createRequest('Bearer t', { text: TEXT, budget_label: 'under 40', budget_max: 40 } as never)).resolves.toEqual({ message: 'Request Successfully Created', id: JOB, ref: 'J-1042', specWriter: 'waiting_for_repo' });
        expect(agents.dispatch.mock.calls).toHaveLength(0);
        const [userId, jobs] = repo.createRequests.mock.calls[0]!;
        expect(userId).toBe(USER);
        expect(jobs[0]).toMatchObject({ category: 'rust', visibility: 'private', budgetLabel: 'under 40', title: 'Our payroll contract splits a USDC payment between workers, but the last...' });
        expect(openLimit(jobs[0]!.limit!.ciphertext)).toBe(40);
    });

    it('marks a request from a service page as direct', async () => {
        repo.getService.mockResolvedValue({ id: 'svc', category: 'Front-end' });
        repo.createRequests.mockResolvedValue([{ id: JOB, ref: 'J-1050' }]);
        await service.createRequest('Bearer t', { text: 'Fix the wallet selector modal on Safari.', service_id: '2b1f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' } as never);
        expect(repo.createRequests.mock.calls[0]![1][0]).toMatchObject({ visibility: 'direct', category: 'fe' });
    });

    it('refuses to edit after the job is agreed', async () => {
        repo.getOwnedJob.mockResolvedValue({ id: JOB, ref: 'J-1042', status: 'funded' });
        await expect(service.editRequest('Bearer t', { id: JOB, text: TEXT } as never)).rejects.toThrow('after the job is agreed');
    });

    it('seals each hidden maximum differently', () => {
        expect(sealLimit(40).ciphertext).not.toBe(sealLimit(40).ciphertext);
    });

    it('guesses categories and titles', () => {
        expect(guessCategory('Fix my wallet modal on Safari')).toBe('fe');
        expect(guessCategory('Write unit tests until coverage reaches 90%')).toBe('tests');
        expect(guessCategory('Export NEP-141 holders to CSV')).toBe('scripts');
        expect(titleOf('Short one. Then more text.')).toBe('Short one.');
    });
});
