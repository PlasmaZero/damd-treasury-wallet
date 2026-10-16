import {createWalletService as real} from './walletService.js';
import {createWalletService as mock} from './mockWalletService.js';
export function createWalletService(config){return import.meta.env?.VITE_USE_MOCK==='true'?mock(config):real(config);}
export {MOCK_WALLET,MOCK_ACCOUNTS} from './mockWalletService.js';
