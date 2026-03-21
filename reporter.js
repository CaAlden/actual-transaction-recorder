// Expects a JSON config file to be passed in the env variable CONFIG_FILE.
// The file should contain:
// "dataDir": path
// "serverURL": where to point the requests
// "password": The password for logging in
// "budgetId": The ID of the budget containing the account to write transactions into.
// "accountId": UUID for the account to add transactions to.

import express from 'express'
import AsyncLock from 'async-lock';
import cors from 'cors'
import api from '@actual-app/api';
import fs from 'fs';

function parse(data) {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Bad Data, expected an object, got: ${data === null ? null : typeof data}`);
  }

  if (typeof data.title !== 'string') {
    throw new Error(`Bad Title: ${data.title}`);
  }

  if (typeof data.amount !== 'number' || typeof data.amount !== 'string') {
    throw new Error(`Bad amount: ${data.amount}`);
  }

  if (typeof data.amount === 'string') {
    const value = Number(data.amount.replaceAll(/[^\d]/g, ''));
    data.amount = Number.isNaN(value) ? 0 : value;
  }

  
  return data;
}

function makeTransaction(data, account) {
  return {
    account,
    date: new Date().toLocaleDateString('sv-SE'), // "YYYY-MM-DD"
    payee_name: data.title,
    // Actual considers this an integer representing a decimal value so the last two digits of the integer
    // are placed after the decimal point (unclear why but okay...)
    // It has to be negative or actual will think it's a deposit
    amount: data.amount * -100,
    cleared: true,
  };
}

async function addTransaction(config, transaction) {
  try {
    await api.init({
      dataDir: config.dataDir,
      serverURL: config.serverURL,
      password: config.password,
    });
    await api.downloadBudget(config.budgetId);
    await api.sync();

    await api.addTransactions(config.accountId, [transaction]);
  } finally {
    await api.shutdown();
  }
}

async function init() {
  const config = JSON.parse(fs.readFileSync(process.env.CONFIG_FILE));
  const app = express();
  const lock = new AsyncLock();

  // Adds headers: Access-Control-Allow-Origin: *
  app.use(cors())
  app.use(express.json());

  app.post('/actual-api/transaction', async function (req, res, _next) {
    await lock.acquire('transaction', async () => {
      console.debug('Executing Transaction');
      try {
        const transaction = makeTransaction(parse(req.body), config.accountId);
        console.log(transaction);
        await addTransaction(config, transaction)
        console.log(`Successfully logged "${transaction.payee_name} - ￥${transaction.amount}"`);
        return res.json({ result: 'success' });
      } catch (e) {
        console.log('Transaction failed...');
        console.log(e);
        console.log(e.message);
        return res.json({ result: 'failure', error: e.message });
      }
    });
  });

  app.listen(12467, function () {
    console.log('Starting AMEX Transaction Writer');
  });
}

init();
