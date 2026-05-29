import type { IncomingMessage, IncomingWebhookBody } from '../types.js';

export function getIncomingMessage(reqBody: IncomingWebhookBody): IncomingMessage {
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
