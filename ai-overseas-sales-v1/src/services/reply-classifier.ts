export type ReplyIntent =
  | "PRICE_REQUEST"
  | "CATALOG_REQUEST"
  | "DELIVERY_QUESTION"
  | "CALL_REQUEST"
  | "FUTURE_PURCHASE"
  | "INTERESTED"
  | "REJECT"
  | "UNSUBSCRIBE"
  | "UNKNOWN";

export function classifyReply(text: string) {
  const value = text.trim().toLowerCase();

  if (/unsubscribe|remove me|stop contacting|do not contact|не пишите|отпис/i.test(value)) {
    return { intent: "UNSUBSCRIBE" as ReplyIntent, priority: "CLOSED", humanHandoff: false };
  }

  if (/not interested|no interest|не интересно|не интересует/i.test(value)) {
    return { intent: "REJECT" as ReplyIntent, priority: "CLOSED", humanHandoff: false };
  }

  if (/price|quotation|quote|цена|прайс|precio|cotización/i.test(value)) {
    return { intent: "PRICE_REQUEST" as ReplyIntent, priority: "HIGH", humanHandoff: true };
  }

  if (/catalog|catalogue|brochure|каталог|catálogo/i.test(value)) {
    return { intent: "CATALOG_REQUEST" as ReplyIntent, priority: "HIGH", humanHandoff: true };
  }

  if (/delivery|shipping|freight|logistics|доставк|логист|envío/i.test(value)) {
    return { intent: "DELIVERY_QUESTION" as ReplyIntent, priority: "HIGH", humanHandoff: true };
  }

  if (/call|meeting|zoom|whatsapp call|созвон|встреч|llamada|reunión/i.test(value)) {
    return { intent: "CALL_REQUEST" as ReplyIntent, priority: "HIGH", humanHandoff: true };
  }

  if (/next month|later|future|not now|следующ|позже|próximo mes|más tarde/i.test(value)) {
    return { intent: "FUTURE_PURCHASE" as ReplyIntent, priority: "MEDIUM", humanHandoff: false };
  }

  if (/interested|send details|tell me more|интерес|подробнее|interesado|más información/i.test(value)) {
    return { intent: "INTERESTED" as ReplyIntent, priority: "HIGH", humanHandoff: true };
  }

  return { intent: "UNKNOWN" as ReplyIntent, priority: "LOW", humanHandoff: false };
}
