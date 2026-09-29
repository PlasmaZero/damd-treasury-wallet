import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createService } from './walletService.js';
import './style.css';

function App() {
  const [service, setService] = useState(null);
  const [account, setAccount] = useState('');
  const [balance, setBalance] = useState('0');
  const [amount, setAmount] = useState('0.1');
  const [status, setStatus] = useState('Connecting to the local blockchain...');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const walletService = await createService();
        const currentBalance = await walletService.getBalance();
        if (active) {
          setService(walletService);
          setBalance(currentBalance);
          setStatus('Ready. Connect MetaMask to deposit test ETH.');
        }
      } catch (error) {
        if (active) setStatus(error.shortMessage || error.message);
      }
    }
    load();
    function resetConnection() {
      setAccount('');
      setStatus('Wallet or network changed. Connect again before depositing.');
    }
    window.ethereum?.on('accountsChanged', resetConnection);
    window.ethereum?.on('chainChanged', resetConnection);
    return () => {
      active = false;
      window.ethereum?.removeListener('accountsChanged', resetConnection);
      window.ethereum?.removeListener('chainChanged', resetConnection);
    };
  }, []);

  async function connectWallet() {
    setBusy(true);
    try {
      setAccount(await service.connect());
      setStatus('Wallet connected.');
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshBalance() {
    setBusy(true);
    try {
      setBalance(await service.getBalance());
      setStatus('Balance updated.');
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deposit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus('Confirm the deposit in MetaMask.');
    try {
      const transaction = await service.deposit(amount);
      setStatus('Deposit submitted. Waiting for confirmation...');
      await transaction.wait();
      setBalance(await service.getBalance());
      setStatus('Deposit confirmed. Treasury balance updated.');
    } catch (error) {
      setStatus(error.shortMessage || error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">DAMD / CSE 416 / MILESTONE 2</p>
      <h1>Treasury prototype</h1>
      <p>Connect a wallet, view the balance, and deposit local test ETH.</p>
      <p className="status" role="status" aria-live="polite">{status}</p>
      <section>
        <h2>Wallet</h2>
        <p className="address">{account || 'No wallet connected.'}</p>
        <button disabled={!service || busy} onClick={connectWallet}>Connect MetaMask</button>
      </section>
      <section>
        <h2>Treasury balance</h2>
        <p className="balance">{service ? balance + ' test ETH' : 'Loading...'}</p>
        <p className="address">Contract: {service?.address || 'Not loaded'}</p>
        <button disabled={!service || busy} onClick={refreshBalance}>Refresh balance</button>
      </section>
      <section>
        <h2>Deposit test ETH</h2>
        <form onSubmit={deposit}>
          <label htmlFor="amount">Amount in ETH</label>
          <input id="amount" type="number" min="0" step="any" required
            value={amount} onChange={event => setAmount(event.target.value)} />
          <button disabled={!service || !account || busy} type="submit">Deposit</button>
        </form>
      </section>
      <footer>
        Local test funds only. Deposits cannot be withdrawn in this prototype.
        Multisignature payments, spending limits, timelocks, and social recovery are planned for later milestones.
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(React.createElement(App));
