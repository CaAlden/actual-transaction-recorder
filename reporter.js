// Expects a JSON config file to be passed in the env variable CONFIG_FILE.
// The file should contain:
// "dataDir": path
// "accountId": UUID for the account to add transactions to.

import express from 'express'
import AsyncLock from 'async-lock';
import cors from 'cors'
import api from '@actual-app/api';
import fs from 'fs';

function parse(data) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Bad Data');
  }

  if (typeof data.title !== 'string') {
    throw new Error('Bad Title');
  }

  if (typeof data.amount !== 'number') {
    throw new Error('Bad amount');
  }
  
  return data;
}

function makeTransaction(data, account) {
  return {
    account,
    date: new Date().toLocaleDateString('sv-SE'), // "YYYY-MM-DD"
    payee_name: data.title,
    amount: data.amount,
    cleared: true,
  };
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
        await api.init({
          dataDir: config.dataDir,
        });
        const transaction = makeTransaction(parse(req.body), config.accountId);
        console.log(transaction);
        await api.addTransactions(config.accountId, [transaction]);
        console.log(`Successfully logged "${transaction.payee_name} - ￥${transaction.amount}"`);
        return res.json({ result: 'success' });
      } catch (e) {
        console.log('Transaction failed...');
        console.log(e);
        console.log(e.message);
        return res.json({ result: 'failure' });
      } finally {
        await api.shutdown();
      }
    });
  });

  app.listen(12467, function () {
    console.log('Starting AMEX Transaction Writer');
  });
}

init();
