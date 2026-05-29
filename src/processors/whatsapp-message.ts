import type {
  AiResponse,
  IncomingMessage,
  V2UploadResponse,
} from '../types.js';
import {
  downloadWhatsAppMedia,
  fetchWhatsAppMediaMetadata,
  markWhatsAppMessageReadAndTypingIndicator,
  sendWhatsAppImageMessage,
  sendWhatsAppTextMessage,
  sendWhatsAppInteractiveCtaMessage,
  uploadFile,
} from '../whatsapp/client.js';
import { forwardMessageToChatService } from '../chat/client.js';

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

  return uploadFile({
    files: [
      {
        blob: downloadedMedia.blob,
        filename: resolvedFilename,
      },
    ],
  });
}

function buildProductBody(item: AiResponse['products'][number]) {
  const product = item.product_metadata || item;

  return `
✨ ${product.title}

${item.routine_time ? `🕒 ${item.routine_time}` : ''}
💰 ₹${product.sp || product.mrp || ''}
  `.trim();
}

export async function processWhatsAppMessageInBackground(params: {
  from: string;
  messageId?: string;
  text?: string;
  imageId?: string;
  imageCaption?: string;
  imageFilename?: string;
  imageMimeType?: string;
}) {
  const {
    from,
    messageId,
    text,
    imageId,
    imageCaption,
    imageFilename,
    imageMimeType,
  } = params;

  try {
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

    await typingPromise;

    const aiResponse = await forwardMessageToChatService(
      text || imageCaption || undefined,
      from,
      uploadResponse
    );
    if (aiResponse.text) {
      // Split by 1 or more real newlines, literal '\n', or literal '/n', trim spaces, and remove empty strings
      const messages = aiResponse.text.split(/(?:\n|\\n|\/n)+/).map(msg => msg.trim()).filter(Boolean);
      for (const msg of messages) {
        await sendWhatsAppTextMessage(from, msg);
      }
    }

    for (const item of aiResponse.products) {
      const product = item.product_metadata || item;
      const productUrl = product.url || item.url || '';
      const bodyText = buildProductBody(item);
      const imageUrl = item.product_metadata?.image_url || item.image_url;

      if (productUrl) {
        await sendWhatsAppInteractiveCtaMessage(
          from,
          imageUrl,
          bodyText,
          'View Product',
          productUrl
        );
      } else {
        if (imageUrl) {
          await sendWhatsAppImageMessage(from, imageUrl, bodyText);
        } else {
          await sendWhatsAppTextMessage(from, bodyText);
        }
      }
    }

    if (aiResponse.directions) {
      await sendWhatsAppTextMessage(from, `📋 Routine:\n\n${aiResponse.directions}`);
    }

    if (aiResponse.trigger_consultation) {
      await sendWhatsAppInteractiveCtaMessage(
        from,
        undefined,
        'You can book a consultation with our dermatologists to get started with proper treatment.',
        'Consult Doctor',
        'https://www.clinikally.com/consult'
      );
    }
  } catch (error: unknown) {
    console.error('Failed to process WhatsApp message', error);

    try {
      await sendWhatsAppTextMessage(
        from,
        "Sorry, I'm having trouble processing that right now. Please try again later."
      );
    } catch (fallbackError) {
      console.error('Failed to send error fallback message', fallbackError);
    }
  }
}
