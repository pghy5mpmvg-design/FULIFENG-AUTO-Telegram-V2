import 'dotenv/config';
import OpenAI from 'openai';
import { Telegraf, Markup } from 'telegraf';

const token = process.env.BOT_TOKEN?.trim();
if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN') {
  console.error('BOT_TOKEN is missing. Set BOT_TOKEN in Railway Variables.');
  process.exit(1);
}
const bot = new Telegraf(token);
const openai = process.env.OPENAI_API_KEY ? new OpenAI({apiKey:process.env.OPENAI_API_KEY}) : null;
const leads = new Map();

function getLead(id, patch={}) {
  const key=String(id);
  const old=leads.get(key) || {id:key,stage:'C',source:'telegram',history:[],createdAt:new Date().toISOString()};
  const next={...old,...patch,updatedAt:new Date().toISOString()};
  leads.set(key,next);
  return next;
}
async function aiReply(userText, lead) {
  if (!openai) return null;
  const r=await openai.responses.create({
    model:process.env.OPENAI_MODEL||'gpt-5-mini',
    instructions:`You are FULIFENG AUTO's Russian-speaking car sales assistant. Sell Chinese new and used passenger cars professionally and briefly. Never invent price, stock, customs, delivery time or specifications. If information is missing, ask one concise question. Qualify model, budget, year, mileage, city and purchase timing. Lead stage: ${lead.stage}.`,
    input:userText
  });
  return r.output_text?.trim() || null;
}
bot.start(async ctx=>{
  getLead(ctx.from.id,{firstName:ctx.from.first_name,username:ctx.from.username});
  await ctx.reply('Здравствуйте! 👋\\n\\nFULIFENG AUTO — автомобили из Китая.\\nНовые и б/у автомобили.\\n\\nЧто вас интересует?',Markup.inlineKeyboard([
    [Markup.button.callback('🚗 Новый автомобиль','NEW')],
    [Markup.button.callback('🚙 Б/У автомобиль','USED')],
    [Markup.button.callback('🔥 Подбор по бюджету','BUDGET')],
    [Markup.button.callback('📩 Связаться с менеджером','MANAGER')]
  ]));
});
bot.action(['NEW','USED','BUDGET','MANAGER'],async ctx=>{
  await ctx.answerCbQuery();
  const type=ctx.match[0], id=ctx.from.id;
  const patch=type==='MANAGER'?{stage:'A',needsHuman:true}:{stage:'B',interest:type.toLowerCase()};
  const l=getLead(id,patch);
  const reply=type==='MANAGER'?'Передал запрос менеджеру. Напишите модель, бюджет и город — это ускорит расчёт.':'Отлично. Напишите модель или бюджет и город доставки. Например: BMW X5, до $45 000, Москва.';
  await ctx.reply(reply);
  if(l.needsHuman && process.env.ADMIN_CHAT_ID) await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID,`🚨 Новый лид\\nTelegram ID: ${id}\\n${JSON.stringify(l,null,2)}`);
});
bot.on('text',async ctx=>{
  const id=ctx.from.id, text=ctx.message.text.trim();
  let l=getLead(id,{firstName:ctx.from.first_name,username:ctx.from.username});
  const lower=text.toLowerCase();
  if(/куп|готов|заберу|срочно|оплат|договор/.test(lower)) l=getLead(id,{stage:'A'});
  else if(/цена|сколько|бюджет|достав|город|москв|санкт|казан/.test(lower)) l=getLead(id,{stage:'B'});
  const answer=await aiReply(text,l) || 'Спасибо! Напишите модель автомобиля, бюджет и город доставки — я подготовлю подборку.';
  l.history.push({role:'user',text,at:new Date().toISOString()},{role:'assistant',text:answer,at:new Date().toISOString()});
  getLead(id,l);
  await ctx.reply(answer);
  if(l.stage==='A' && process.env.ADMIN_CHAT_ID) await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID,`🔥 A-лид\\nTelegram ID: ${id}\\nUsername: @${ctx.from.username||'—'}\\nСообщение: ${text}`);
});
bot.catch(err=>console.error('Telegram error:',err));
await bot.launch();
console.log('FULIFENG AUTO Telegram CRM v2.5 started');
process.once('SIGINT',()=>bot.stop('SIGINT'));
process.once('SIGTERM',()=>bot.stop('SIGTERM'));
