import type { Request, Response } from 'express';
import type {
  AiResponse,
  ChatPayload,
  ChatResponse,
  IncomingMessage,
  IncomingWebhookBody,
  ProductItem,
  QueryValue,
  V2UploadResponse,
  WebhookQuery,
} from './server-types.js';
import { API_URL, META_API_URL, UPLOAD_FILE_URL } from './config.js';
import express from 'express';

const app = express();

app.use(express.json());

const port: string | number = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const dermaGptApiKey = process.env.DERMAGPT_API_KEY || 'dermagptsecretkey123#';

const userThreads = new Map<string, string>();

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

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');

    return res.status(200).send(String(challenge || ''));
  }

  console.log('WEBHOOK VERIFICATION FAILED');

  return res.sendStatus(403);
}

function getIncomingMessage(reqBody: IncomingWebhookBody): IncomingMessage {
  const value = reqBody.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];

  return {
    from: message?.from as string | undefined,
    messageId: message?.id,
    text:
      message?.text?.body ||
      message?.button?.text ||
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      '',
    imageId: message?.image?.id,
    imageCaption: message?.image?.caption,
    imageMimeType: message?.image?.mime_type,
    imageFilename: message?.image?.filename,
  };
}

async function postWhatsAppMessage(payload: Record<string, unknown>) {
  const response = await fetch(
    `${META_API_URL}/v20.0/${whatsappPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    throw new Error(
      `WhatsApp API request failed: ${response.status} ${await response.text()}`
    );
  }

  return response.json();
}

async function sendWhatsAppTextMessage(to: string, body: string) {
  return postWhatsAppMessage({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body,
    },
  });
}

async function sendWhatsAppImageMessage(
  to: string,
  imageUrl: string,
  caption: string
) {
  return postWhatsAppMessage({
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: {
      link: imageUrl,
      caption,
    },
  });
}

async function markWhatsAppMessageReadAndTypingIndicator(messageId: string) {
  return postWhatsAppMessage({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: {
      type: 'text',
    },
  });
}

async function fetchWhatsAppMediaMetadata(mediaId: string) {
  const response = await fetch(
    `${META_API_URL}/v20.0/${mediaId}?fields=url,mime_type`,
    {
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `WhatsApp media lookup failed: ${response.status} ${await response.text()}`
    );
  }

  return (await response.json()) as {
    url?: string;
    mime_type?: string;
  };
}

async function downloadWhatsAppMedia(mediaUrl: string) {
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `WhatsApp media download failed: ${response.status} ${await response.text()}`
    );
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get('content-type') || undefined,
  };
}

async function uploadFile(payload: { files: Array<{ blob: Blob; filename: string }> }) {
  const formData = new FormData();

  payload.files.forEach(({ blob, filename }) => {
    formData.append('files', blob, filename);
  });

  const response = await fetch(UPLOAD_FILE_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': dermaGptApiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `File upload failed: ${response.status} ${await response.text()}`
    );
  }

  return (await response.json()) as V2UploadResponse;
}

function parseNestedJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch (err) {
    console.error('Nested parse failed:', err);
    return value;
  }
}

function normalizeProductList(
  payload: ChatPayload
): ProductItem[] {
  const routineProducts = payload?.routine?.products;

  if (Array.isArray(routineProducts)) {
    return routineProducts;
  }

  if (Array.isArray(payload?.products)) {
    return payload.products;
  }

  return [];
}

async function forwardMessageToChatService(
  messageText: string | undefined,
  from: string,
  uploadResponse?: V2UploadResponse
): Promise<AiResponse> {
  const threadId = userThreads.get(from) || null;
  const payload: Record<string, unknown> = {
    message: typeof messageText === 'string' ? messageText : '',
    thread_id: threadId,
  };

  if (uploadResponse?.file_urls?.length) {
    payload.file_urls = uploadResponse.file_urls;
  }

  if (uploadResponse?.image_category) {
    payload.image_category = uploadResponse.image_category;
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': dermaGptApiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Chat endpoint failed: ${response.status} ${await response.text()}`
    );
  }

  const parsed = (await response.json()) as ChatResponse;

  // console.log('CHAT RESPONSE:', JSON.stringify(parsed, null, 2));

  if (parsed.thread_id) {
    userThreads.set(from, parsed.thread_id);
  }

  let responsePayload: unknown = parsed.response || parsed.message || '';
  responsePayload = parseNestedJson(responsePayload);

  if (typeof responsePayload === 'string') {
    return {
      text: responsePayload,
      products: [],
      directions: '',
    };
  }

  return {
    text: (responsePayload as ChatPayload)?.message || (responsePayload as ChatPayload)?.response || '',
    products: normalizeProductList(responsePayload as ChatPayload),
    directions: (responsePayload as ChatPayload)?.routine?.directions || '',
  };
}

async function handleIncomingImageMessage(
  imageId: string,
  imageFilename: string | undefined,
  imageMimeType: string | undefined
) {
  const mediaMetadata = await fetchWhatsAppMediaMetadata(imageId);
  const mediaUrl = mediaMetadata.url;

  if (!mediaUrl) {
    throw new Error('WhatsApp media lookup did not return a download URL');
  }

  const downloadedMedia = await downloadWhatsAppMedia(mediaUrl);
  const resolvedMimeType =
    mediaMetadata.mime_type ||
    imageMimeType ||
    downloadedMedia.contentType ||
    'application/octet-stream';
  const resolvedFilename =
    imageFilename ||
    `whatsapp-image-${imageId}.${resolvedMimeType.split('/')[1] || 'bin'}`;

  const uploadedFile = downloadedMedia.blob;

  const uploadResponse = await uploadFile({
    files: [
      {
        blob: uploadedFile,
        filename: resolvedFilename,
      },
    ],
  });

  return uploadResponse;
}

async function processWhatsAppMessageInBackground(params: {
  from: string;
  messageId?: string;
  text?: string;
  imageId?: string;
  imageCaption?: string;
  imageFilename?: string;
  imageMimeType?: string;
}) {
  const { from, messageId, text, imageId, imageCaption, imageFilename, imageMimeType } = params;
  try {
    // 3. Concurrency Optimization: Fire typing indicator WITHOUT blocking the image processing
    const typingPromise = messageId 
      ? markWhatsAppMessageReadAndTypingIndicator(messageId).catch(console.error)
      : Promise.resolve();

    let uploadResponse: V2UploadResponse | undefined;

    if (imageId) {
      uploadResponse = await handleIncomingImageMessage(
        imageId,
        imageFilename,
        imageMimeType
      );
    }

    // Wait for typing indicator just in case, though it's likely done by now
    await typingPromise;

    const aiResponse = await forwardMessageToChatService(
      text || imageCaption || undefined,
      from,
      uploadResponse
    );

    if (aiResponse.text) {
      await sendWhatsAppTextMessage(from, aiResponse.text);
    }

    // 2. Ordering Optimization: Send products sequentially to guarantee chat order
    for (const item of aiResponse.products) {
      const product = item.product_metadata || item;

      if (!product?.title) {
        continue;
      }

      const productUrl = product.url || item.url || '';
      const caption = `
✨ ${product.title}

${item.routine_time ? `🕒 ${item.routine_time}` : ''}
💰 ₹${product.sp || product.mrp || ''}

🔗 ${productUrl}
      `.trim();

      const imageUrl = product.image_url || item.image_url;

      if (imageUrl) {
        await sendWhatsAppImageMessage(from, imageUrl, caption);
      } else {
        await sendWhatsAppTextMessage(from, caption);
      }
    }

    if (aiResponse.directions) {
      await sendWhatsAppTextMessage(from, `📋 Routine:\n\n${aiResponse.directions}`);
    }
  } catch (error: unknown) {
    console.error('Failed to process WhatsApp message', error);
    try {
      await sendWhatsAppTextMessage(from, "Sorry, I'm having trouble processing that right now. Please try again later.");
    } catch (fallbackError) {
      console.error('Failed to send error fallback message', fallbackError);
    }
  }
}

function handleWhatsappWebhook(
  req: Request<{}, unknown, IncomingWebhookBody, WebhookQuery>,
  res: Response
) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  console.log(`\nWebhook received ${timestamp}\n`);

  res.status(200).end();

  const {
    from,
    messageId,
    text,
    imageId,
    imageCaption,
    imageFilename,
    imageMimeType,
  } =
    getIncomingMessage(req.body);
  if (!from || (!text && !imageId)) {
    console.log('Skipping webhook payload: no supported message content');
    return;
  }

  // 1. Better Pattern: Extracted into a separate background async function
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

app.get('/webhook', verifyWebhook);
app.post('/webhook', handleWhatsappWebhook);
app.post(
  '/send-whatsapp',
  async (req: Request<{}, unknown, { to?: string }>, res: Response) => {
    try {
      const { to } = req.body;

      if (!to) {
        return res.status(400).json({ error: 'Missing "to" in request body' });
      }

      const data = await postWhatsAppMessage({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'clara',
          language: {
            code: 'en',
          },
        },
      });

      res.json(data);
    } catch (error: unknown) {
      console.error(error);

      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`\nListening on port ${port}\n`);

    if (!verifyToken) {
      console.warn('VERIFY_TOKEN is missing');
    }

    if (!whatsappToken || !whatsappPhoneNumberId) {
      console.warn('WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing');
    }
  });
}
