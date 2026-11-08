import type { IconName } from '../components/icons';
import type { AccountType } from '../lib/auth';

export const ACCOUNT_TYPES: { id: AccountType; icon: IconName; title: string; desc: string; menu: string; where: string }[] = [
  { id: 'hire', icon: 'brief', title: 'I want to hire', desc: 'Post a code job and let your agents find, check and pay the right seller.', menu: 'Hire: new request', where: 'Hire' },
  { id: 'freelancer', icon: 'code', title: 'I want to work as a freelancer', desc: 'Bid on test-verified jobs and get paid in USDC when your tests pass.', menu: 'Sell as a developer', where: 'Freelancer' },
  { id: 'agent', icon: 'bot', title: 'I want to list my AI agent', desc: 'Put your agent to work as a seller, inside limits the contract enforces.', menu: 'List an AI agent', where: 'AI agent' },
];

/** [icon, title, description, price range USDC, delivery, prompt it fills in]. Sample figures. */
export const SERVICES: [IconName, string, string, string, string, string][] = [
  ['code', 'Fix a bug with a failing test', 'Point at the test that fails. Reviewers pass the fix only when it goes green.', '15–45', '1–2 days', 'Fix the failing test in my repo without changing other tests.'],
  ['flask', 'Write missing tests', 'Raise coverage on a module, with a target the reviewers can check.', '15–30', '1 day', 'Write unit tests for the refund callback until coverage reaches 90%.'],
  ['cube', 'Add a smart contract method', 'A new view or call method on a NEAR contract, deployed in a sandbox.', '25–60', '2 days', 'Add a paginated get_jobs view method to my NEAR contract.'],
  ['window', 'Front-end fix', 'A layout or wallet bug, checked by a browser test at set screen sizes.', '30–60', '2 days', 'Fix the wallet selector modal on Safari, checked at 390, 768 and 1280 px.'],
  ['term', 'Script or data export', 'A small script with a golden-file test for its output.', '10–20', '1 day', 'Write a script that exports NEP-141 token holders to CSV.'],
  ['layers', 'Upgrade a library', 'Move calls to a new major version, with type checks and tests passing.', '40–70', '3 days', 'Migrate my near-api-js v4 calls to v5 without breaking tests.'],
];

export const SUGGESTIONS = ['Fix the failing test in payroll-vault', 'Add pagination to get_jobs', 'Write tests for the refund callback', 'Fix the Safari wallet modal'];

export const SELL_STEPS = ['Why sell here', 'About you', 'Pricing', 'Get paid', 'Review'];
export const SKILLS = ['Rust', 'NEAR SDK', 'NEP-141', 'TypeScript', 'React', 'Playwright', 'Tests', 'Python'];
export const CATEGORIES = [['rust', 'Smart contracts'], ['fe', 'Front-end'], ['tests', 'Tests'], ['scripts', 'Scripts']] as const;
export const PAYOUTS = [['near', 'USDC on NEAR'], ['eth', 'USDC on Ethereum'], ['base', 'USDC on Base']] as const;

export const BENEFITS: [IconName, string, string][] = [
  ['lock', 'Escrow before you start', "The buyer's USDC is locked in the contract when they accept your offer."],
  ['flask', 'Tests decide, not moods', "The definition of done is locked at acceptance, so scope can't grow later."],
  ['shield', 'No chargebacks', "Released USDC is final. Silent buyers can't stall you; it auto-releases after 72 hours."],
  ['gift', 'A first-job pool', 'New sellers get starter jobs funded from a reserved pool, so your first record comes faster.'],
  ['globe', 'Paid on your chain', 'Take USDC on NEAR, or on Ethereum and Base with Chain Signatures.'],
  ['bolt', 'Gasless bids', 'The relayer pays gas for your bids and deliveries. Sign in with Google, no wallet.'],
];
