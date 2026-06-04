import {
  DERMAGPT_API_KEY,
  META_API_URL,
  META_API_VERSION,
  UPLOAD_FILE_URL,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_TOKEN,
} from '../config.js';
import type { V2UploadResponse } from '../types.js';

async function sendWhatsAppRequest(payload: Record<string, unknown>) {
  const response = await fetch(
    `${META_API_URL}/${META_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
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
export async function sendWhatsAppWelcomeTextMessage(to: string) {
  return sendWhatsAppRequest({
    messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: 'Hi',
      },
  });
}

export async function sendWhatsAppTextMessage(to: string, body: string) {
  return sendWhatsAppRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body,
    },
  });
}

export async function sendWhatsAppImageMessage(
  to: string,
  imageUrl: string,
  caption: string
) {
  return sendWhatsAppRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: {
      link: imageUrl,
      caption,
    },
  });
}

export async function sendWhatsAppInteractiveCtaMessage(
  to: string,
  imageUrl: string | undefined,
  bodyText: string,
  buttonText: string,
  buttonUrl: string
) {
  const interactive: any = {
    type: 'cta_url',
    body: {
      text: bodyText,
    },
    action: {
      name: 'cta_url',
      parameters: {
        display_text: buttonText,
        url: buttonUrl,
      },
    },
  };

  if (imageUrl) {
    interactive.header = {
      type: 'image',
      image: {
        link: imageUrl,
      },
    };
  }

  return sendWhatsAppRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive,
  });
}

export async function sendWhatsAppInteractiveCarouselMessage(
  to: string,
  cards: Array<{
    imageUrl?: string;
    bodyText: string;
    buttonText?: string;
    buttonUrl?: string;
  }>
) {
  const mappedCards = cards.slice(0, 10).map((card, index) => {
    const formattedCard: any = {
      card_index: index,
      body: {
        text: card.bodyText,
      },
    };

    if (card.imageUrl) {
      formattedCard.header = {
        type: 'image',
        image: {
          link: card.imageUrl,
        },
      };
    }

    if (card.buttonUrl && card.buttonText) {
      formattedCard.type = 'cta_url';
      formattedCard.action = {
        name: 'cta_url',
        parameters: {
          display_text: card.buttonText,
          url: card.buttonUrl,
        },
      };
    } else {
      formattedCard.type = 'button';
      formattedCard.action = {
        buttons: [],
      };
    }

    return formattedCard;
  });

  return sendWhatsAppRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'carousel',
      action: {
        cards: mappedCards,
      },
    },
  });
}

export async function markWhatsAppMessageReadAndTypingIndicator(messageId: string) {
  return sendWhatsAppRequest({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
    typing_indicator: {
      type: 'text',
    },
  });
}

export async function fetchWhatsAppMediaMetadata(mediaId: string) {
  const response = await fetch(
    `${META_API_URL}/${META_API_VERSION}/${mediaId}?fields=url,mime_type`,
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
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

export async function downloadWhatsAppMedia(mediaUrl: string) {
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
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

export async function uploadFile(payload: {
  files: Array<{ blob: Blob; filename: string }>;
}) {
  const formData = new FormData();

  payload.files.forEach(({ blob, filename }) => {
    formData.append('files', blob, filename);
  });

  const response = await fetch(UPLOAD_FILE_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': DERMAGPT_API_KEY,
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
