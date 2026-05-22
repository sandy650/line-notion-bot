require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { handleEvent } = require('./lineHandler');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();

// LINE webhook endpoint - must use LINE middleware before body parser
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(event => handleEvent(event, client)))
    .then(result => res.json(result))
    .catch(err => {
      console.error('[Webhook Error]', err);
      res.status(500).end();
    });
});

app.get('/', (_req, res) => res.send('LINE Notion Bot is running!'));

// Must be defined after routes to catch errors from LINE middleware (e.g. invalid signature)
app.use((err, req, res, next) => {
  console.error('[Express Error]', err);
  res.status(err.status || 500).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
