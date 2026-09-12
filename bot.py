import os
import sqlite3
import logging
from datetime import datetime

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

DB_FILE = "customers.db"


# =========================
# 数据库
# =========================

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER,
            username TEXT,
            name TEXT,
            country TEXT,
            interest TEXT,
            budget TEXT,
            grade TEXT DEFAULT 'C',
            status TEXT DEFAULT 'new',
            created_at TEXT
        )
    """)

    conn.commit()
    conn.close()


def add_customer(
    telegram_id,
    username,
    name,
    country="",
    interest="",
    budget="",
    grade="C"
):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO customers
        (telegram_id, username, name, country, interest, budget, grade, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        telegram_id,
        username,
        name,
        country,
        interest,
        budget,
        grade,
        "new",
        datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()


def get_customer_count():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM customers")
    count = cursor.fetchone()[0]

    conn.close()

    return count


# =========================
# 主菜单
# =========================

main_keyboard = ReplyKeyboardMarkup(
    keyboard=[
        [
            KeyboardButton(text="🚗 Купить автомобиль"),
            KeyboardButton(text="📋 Мои требования")
        ],
        [
            KeyboardButton(text="💰 Получить цену"),
            KeyboardButton(text="📞 Связаться с менеджером")
        ]
    ],
    resize_keyboard=True
)


# =========================
# /start
# =========================

@dp.message(CommandStart())
async def start_handler(message: types.Message):

    name = message.from_user.first_name or ""

    add_customer(
        telegram_id=message.from_user.id,
        username=message.from_user.username or "",
        name=name
    )

    text = f"""
Здравствуйте, {name}! 👋

🇨🇳 Добро пожаловать в FULIFENG AUTO.

Мы помогаем покупать автомобили напрямую из Китая
и организуем экспорт в Россию и страны СНГ.

🚗 Новые и подержанные автомобили
🚚 Доставка из Китая
🔧 Комплектации и доработки
📦 Экспортное сопровождение

Выберите, что вас интересует:
"""

    await message.answer(
        text,
        reply_markup=main_keyboard
    )


# =========================
# Купить автомобиль
# =========================

@dp.message(lambda message: message.text == "🚗 Купить автомобиль")
async def buy_car(message: types.Message):

    text = """
🚗 Отлично!

Напишите нам:

1. Марка и модель
2. Желаемый год
3. Бюджет
4. Россия / другой город
5. Новая или б/у

Например:

Toyota RAV4
2023-2025
до 3 000 000 ₽
Москва
б/у

После этого мы подберём варианты из Китая.
"""

    await message.answer(text)


# =========================
# Требования
# =========================

@dp.message(lambda message: message.text == "📋 Мои требования")
async def requirements(message: types.Message):

    await message.answer("""
📋 Чтобы подобрать автомобиль, отправьте:

Марка:
Модель:
Год:
Бюджет:
Комплектация:
Привод:
Цвет:

Можно написать всё одним сообщением.
Наш менеджер подготовит варианты.
""")


# =========================
# Цена
# =========================

@dp.message(lambda message: message.text == "💰 Получить цену")
async def price(message: types.Message):

    await message.answer("""
💰 Хотите узнать цену автомобиля?

Отправьте:

🚗 Марка + модель
📅 Год
⚙️ Комплектация
📍 Город доставки

Мы рассчитаем ориентировочную стоимость
автомобиля из Китая.
""")


# =========================
# Менеджер
# =========================

@dp.message(lambda message: message.text == "📞 Связаться с менеджером")
async def manager(message: types.Message):

    await message.answer("""
📞 Связаться с менеджером FULIFENG AUTO:

Telegram: @fulifeng

Мы ответим на вопросы по автомобилям,
ценам, доставке и экспорту.
""")


# =========================
# /stats
# =========================

@dp.message(Command("stats"))
async def stats_handler(message: types.Message):

    count = get_customer_count()

    await message.answer(
        f"""
📊 FULIFENG AUTO CRM

Всего客户: {count}

系统状态：正常
"""
    )


# =========================
# 普通消息
# =========================

@dp.message()
async def message_handler(message: types.Message):

    user = message.from_user

    # 如果用户发送汽车需求
    if message.text:

        add_customer(
            telegram_id=user.id,
            username=user.username or "",
            name=user.first_name or "",
            interest=message.text,
            grade="C"
        )

        await message.answer("""
Спасибо! 👍

Мы получили ваш запрос.

Чтобы быстрее подобрать автомобиль,
напишите ваш бюджет и желаемую модель.

Например:

BMW X5
2023 год
до 5 000 000 ₽
Москва
""")


# =========================
# 启动
# =========================

async def main():

    init_db()

    logging.info("FULIFENG AUTO Telegram Bot started")

    await dp.start_polling(bot)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
