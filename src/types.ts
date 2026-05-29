export type QueryValue = string | string[] | undefined;

export type WebhookQuery = {
  'hub.mode'?: QueryValue;
  'hub.challenge'?: QueryValue;
  'hub.verify_token'?: QueryValue;
  [key: string]: QueryValue;
};

export type IncomingWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          id?: string;
          type?: string;
          text?: {
            body?: string;
          };
          image?: {
            id?: string;
            mime_type?: string;
            caption?: string;
            filename?: string;
          };
          document?: {
            id?: string;
            mime_type?: string;
            caption?: string;
            filename?: string;
          };
          video?: {
            id?: string;
            mime_type?: string;
            caption?: string;
            filename?: string;
          };
          audio?: {
            id?: string;
            mime_type?: string;
            filename?: string;
          };
          button?: {
            text?: string;
          };
          interactive?: {
            button_reply?: {
              title?: string;
            };
            list_reply?: {
              title?: string;
            };
          };
        }>;
      };
    }>;
  }>;
};

export type ChatResponse = {
  response?: unknown;
  message?: unknown;
  [key: string]: unknown;
};

export type ProductItem = {
  title?: string;
  url?: string;
  image_url?: string;
  sp?: string | number;
  mrp?: string | number;
  routine_time?: string;
  product_metadata?: ProductItem;
  [key: string]: unknown;
};

export type ChatPayload = {
  message?: string;
  response?: string;
  triggers_consultation?: boolean;
  routine?: {
    directions?: string;
    products?: ProductItem[];
  };
  products?: ProductItem[];
  [key: string]: unknown;
};

export type AiResponse = {
  text: string;
  products: ProductItem[];
  directions: string;
  trigger_consultation: boolean;
};

export type IncomingMessage = {
  from?: string;
  messageId?: string;
  text: string;
  imageId?: string;
  imageCaption?: string;
  imageMimeType?: string;
  imageFilename?: string;
};

export type V2UploadResponse = {
  file_urls?: string[];
  image_category?: string;
  is_relevant?: boolean;
  is_pdf?: boolean;
  error?: unknown;
  [key: string]: unknown;
};
export type SendWhatsAppBody = {
  to?: string;
};