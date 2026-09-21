import type { EnrichedLead } from "../types/lead.js";

type MessageInput = {
  lead: EnrichedLead;
  offer?: string;
};

export function generateFirstTouch({ lead, offer }: MessageInput) {
  const lang = lead.contact?.language || "en";
  const name = lead.contact?.fullName?.trim();
  const company = lead.companyName;
  const industry = lead.industry || lead.businessType || "your market";
  const product = offer || "our export-ready products";

  if (lang === "ru") {
    return {
      language: "ru",
      subject: `Предложение для ${company}`,
      body: `${name ? `Здравствуйте, ${name}.` : "Здравствуйте."}

Я изучал компании в вашей отрасли и обратил внимание на ${company}. Судя по открытой информации, вы работаете в направлении ${industry}.

Мы можем предложить ${product} с экспортной поддержкой и поставкой из Китая.

Если это направление сейчас актуально, я могу отправить доступные позиции, цены и условия поставки.

С уважением`
    };
  }

  if (lang === "es") {
    return {
      language: "es",
      subject: `Posible cooperación con ${company}`,
      body: `${name ? `Hola ${name},` : "Hola,"}

Estuve revisando empresas de su sector y encontré ${company}. Por la información pública, trabajan en ${industry}.

Podemos ofrecer ${product} con soporte de exportación desde China.

Si actualmente están buscando nuevos proveedores, puedo enviar disponibilidad, precios y condiciones de entrega.

Saludos`
    };
  }

  return {
    language: "en",
    subject: `Potential cooperation with ${company}`,
    body: `${name ? `Hi ${name},` : "Hello,"}

I came across ${company} while researching companies in ${industry}. Based on the public information available, your business looks relevant to the market we serve.

We can provide ${product} with export support from China.

If you are currently evaluating suppliers, I can send current availability, pricing and delivery terms.

Best regards`
  };
}
