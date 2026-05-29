import type { Request, Response } from 'express';
import express from 'express';
import {
  PORT,
  VERIFY_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_TOKEN,
} from './config.js';
import { processWhatsAppMessageInBackground } from './processors/whatsapp-message.js';
import type {
  IncomingWebhookBody,
  QueryValue,
  SendWhatsAppBody,
  WebhookQuery,
} from './types.js';
import { getIncomingMessage } from './webhook/parser.js';
import { sendWhatsAppWelcomeTextMessage } from './whatsapp/client.js';

const app = express();

app.use(express.json());

function getQueryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function verifyWebhook(
  req: Request<{}, string, never, WebhookQuery>,
  res: Response
) {
  const mode = getQueryValue(req.query['hub.mode']);
  const challenge = getQueryValue(req.query['hub.challenge']);
  const token = getQueryValue(req.query['hub.verify_token']);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK VERIFIED');

    return res.status(200).send(String(challenge || ''));
  }

  console.log('WEBHOOK VERIFICATION FAILED');

  return res.sendStatus(403);
}

function handleWhatsappWebhook(
  req: Request<{}, unknown, IncomingWebhookBody, WebhookQuery>,
  res: Response
) {
  res.status(200).end(); // directly send it to meta

  const { from, messageId, text, imageId, imageCaption, imageFilename, imageMimeType } =
    getIncomingMessage(req.body);
  if (!from || (!text && !imageId)) {
    console.log('Skipping webhook payload: no supported message content');
    return;
  }

  processWhatsAppMessageInBackground({
    from,
    messageId,
    text,
    imageId,
    imageCaption,
    imageFilename,
    imageMimeType,
  });
}



async function handleSendWhatsApp(
  req: Request<{}, unknown, SendWhatsAppBody>,
  res: Response
) {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Missing "to" in request body' });
    }

    const result = await sendWhatsAppWelcomeTextMessage(to);
    return res.status(200).json({ success: true, result });
  } catch (error: unknown) {
    console.error(error);

    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWhatsappWebhook);
app.post('/send-to-whatsapp', handleSendWhatsApp);

export function startServer() {
  app.listen(PORT, () => {
    console.log(`\nListening on port ${PORT}\n`);

    if (!VERIFY_TOKEN) {
      console.warn('VERIFY_TOKEN is missing');
    }

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing');
    }
  });
}

if (require.main === module) {
  startServer();
}

export { app };
