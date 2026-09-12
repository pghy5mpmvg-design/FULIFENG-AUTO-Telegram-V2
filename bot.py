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


# =========================================================
# DATABASE
# =========================================================

def get_db():
    return sqlite3.connect(DB_FILE)


def init_db():

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        name TEXT,
        country TEXT DEFAULT 'Россия',
        city TEXT,
        car TEXT,
        year TEXT,
        budget TEXT,
        quantity TEXT,
        purchase_time TEXT,
        grade TEXT DEFAULT 'C',
        status TEXT DEFAULT 'new',
        last_message TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    conn.commit()
    conn.close()


def create_customer(message):

    conn = get_db()
    cursor = conn.cursor()

    now = datetime.now().isoformat()

    cursor.execute("""
    INSERT OR IGNORE INTO customers
    (
        telegram_id,
        username,
        name,
        country,
        created_at,
        updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        message.from_user.id,
        message.from_user.username or "",
        message.from_user.first_name or "",
        "Россия",
        now,
        now
    ))

    conn.commit()
    conn.close()


def update_customer(telegram_id, field, value):

    allowed_fields = [
        "city",
        "car",
        "year",
        "budget",
        "quantity",
        "purchase_time",
        "grade",
        "status",
        "last_message"
    ]

    if field not in allowed_fields:
        return

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        f"""
        UPDATE customers
        SET {field} = ?, updated_at = ?
        WHERE telegram_id = ?
        """,
        (
            value,
            datetime.now().isoformat(),
            telegram_id
        )
    )

    conn.commit()
    conn.close()


def get_customer(telegram_id):

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT *
    FROM customers
    WHERE telegram_id = ?
    """, (telegram_id,))

    result = cursor.fetchone()

    conn.close()

    return result


def get_stats():

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM customers")
    total = cursor.fetchone()[0]

    cursor.execute(
        "SELECT COUNT(*) FROM customers WHERE grade='A'"
    )
    a = cursor.fetchone()[0]

    cursor.execute(
        "SELECT COUNT(*) FROM customers WHERE grade='B'"
    )
    b = cursor.fetchone()[0]

    cursor.execute(
        "SELECT COUNT(*) FROM customers WHERE grade='C'"
    )
    c = cursor.fetchone()[0]

    conn.close()

    return total, a, b, c


# =========================================================
# CUSTOMER GRADE
# =========================================================

def calculate_grade(customer):

    if not customer:
        return "C"

    city = customer[5]
    car = customer[6]
    year = customer[7]
    budget = customer[8]
    quantity = customer[9]
    purchase_time = customer[10]

    score = 0

    if car:
        score += 2

    if year:
        score += 1

    if budget:
        score += 2

    if city:
        score += 1

    if quantity:
        score += 1

    if purchase_time:
        if "1" in purchase_time or "сейчас" in purchase_time.lower():
            score += 3
        else:
            score += 1

    if score >= 7:
        return "A"

    if score >= 4:
        return "B"

    return "C"


def refresh_grade(telegram_id):

    customer = get_customer(telegram_id)

    grade = calculate_grade(customer)

    update_customer(
        telegram_id,
        "grade",
        grade
    )

    return grade


# =========================================================
# MAIN KEYBOARD
# =========================================================

main_keyboard = ReplyKeyboardMarkup(
    keyboard=[
        [
            KeyboardButton(text="🚗 Подобрать автомобиль"),
            KeyboardButton(text="💰 Узнать цену")
        ],
        [
            KeyboardButton(text="📋 Мои требования"),
            KeyboardButton(text="👨‍💼 Менеджер")
        ]
    ],
    resize_keyboard=True
)


# =========================================================
# /START
# =========================================================

@dp.message(CommandStart())
async def start_handler(message: types.Message):

    create_customer(message)

    await message.answer(
        """
🇷🇺 Здравствуйте!

Добро пожаловать в **FULIFENG AUTO** 🇨🇳🚗

Мы помогаем покупать автомобили напрямую из Китая
с доставкой в Россию и страны СНГ.

Наши услуги:

🚗 Новые автомобили
🚙 Автомобили с пробегом
🔧 Комплектации и доработки
📦 Экспорт из Китая
🚢 Доставка
📑 Экспортное сопровождение

Что вас интересует?
""",
        reply_markup=main_keyboard
    )


# =========================================================
# BUY CAR
# =========================================================

@dp.message(lambda message: message.text == "🚗 Подобрать автомобиль")
async def buy_car(message: types.Message):

    create_customer(message)

    await message.answer(
        """
🚗 Отлично!

Давайте подберём автомобиль.

Напишите, пожалуйста:

1️⃣ Марка и модель
2️⃣ Желаемый год
3️⃣ Ваш бюджет
4️⃣ Город в России
5️⃣ Количество автомобилей

Например:

BMW X5
2023–2025
до 5 000 000 ₽
Москва
1 автомобиль
"""
    )


# =========================================================
# PRICE
# =========================================================

@dp.message(lambda message: message.text == "💰 Узнать цену")
async def price(message: types.Message):

    create_customer(message)

    await message.answer(
        """
💰 Рассчитаем стоимость автомобиля из Китая.

Напишите:

🚗 Марка и модель
📅 Год
⚙️ Комплектация
💰 Бюджет
📍 Город доставки

После этого менеджер подготовит расчёт.
"""
    )


# =========================================================
# REQUIREMENTS
# =========================================================

@dp.message(lambda message: message.text == "📋 Мои требования")
async def requirements(message: types.Message):

    create_customer(message)

    await message.answer(
        """
📋 Ваши требования к автомобилю.

Отправьте одним сообщением:

Марка:
Модель:
Год:
Бюджет:
Город:
Количество:

Например:

Toyota RAV4
2024
до 3 000 000 ₽
Владивосток
2 автомобиля
"""
    )


# =========================================================
# MANAGER
# =========================================================

@dp.message(lambda message: message.text == "👨‍💼 Менеджер")
async def manager(message: types.Message):

    await message.answer(
        """
👨‍💼 FULIFENG AUTO

Наш менеджер поможет:

🚗 подобрать автомобиль
💰 рассчитать стоимость
🚢 организовать доставку
📑 объяснить экспорт

Telegram:
@fulifeng
"""
    )


# =========================================================
# ADMIN STATS
# =========================================================

@dp.message(Command("stats"))
async def stats_handler(message: types.Message):

    total, a, b, c = get_stats()

    await message.answer(
        f"""
📊 FULIFENG AUTO CRM

👥 Всего клиентов: {total}

🔴 A — горячие: {a}
🟡 B — потенциальные: {b}
🟢 C — долгосрочные: {c}

D级客户不进入重点跟进。
"""
    )


# =========================================================
# CUSTOMER MESSAGE PROCESSING
# =========================================================

@dp.message()
async def customer_message(message: types.Message):

    create_customer(message)

    telegram_id = message.from_user.id

    text = message.text or ""

    update_customer(
        telegram_id,
        "last_message",
        text
    )

    customer = get_customer(telegram_id)

    # -----------------------------------------------------
    # 自动识别一些常见信息
    # -----------------------------------------------------

    lower_text = text.lower()

    # 城市
    cities = [
        "москва",
        "санкт-петербург",
        "владивосток",
        "екатеринбург",
        "новосибирск",
        "казань",
        "красноярск",
        "иркутск",
        "хабаровск"
    ]

    for city in cities:

        if city in lower_text:

            update_customer(
                telegram_id,
                "city",
                city.title()
            )

            break

    # 数量
    if any(
        word in lower_text
        for word in ["2 авто", "3 авто", "5 авто", "10 авто", "оптом"]
    ):

        update_customer(
            telegram_id,
            "quantity",
            text
        )

    # 车型关键词
    car_keywords = [
        "toyota",
        "bmw",
        "mercedes",
        "audi",
        "volkswagen",
        "volvo",
        "lexus",
        "honda",
        "kia",
        "hyundai",
        "geely",
        "chery",
        "byd",
        "zeekr",
        "li auto",
        "jetta"
    ]

    for car in car_keywords:

        if car in lower_text:

            update_customer(
                telegram_id,
                "car",
                text
            )

            break

    # -----------------------------------------------------
    # 自动评级
    # -----------------------------------------------------

    grade = refresh_grade(telegram_id)

    # -----------------------------------------------------
    # 回复客户
    # -----------------------------------------------------

    if grade == "A":

        reply = """
🔥 Спасибо!

Ваш запрос выглядит очень конкретным.

Мы можем быстро подобрать варианты из Китая.

Пожалуйста, отправьте:

🚗 модель
📅 год
💰 бюджет
📍 город доставки

После этого подготовим предложение.
"""

    elif grade == "B":

        reply = """
👍 Спасибо за информацию!

Мы можем подобрать несколько вариантов
из Китая под ваш бюджет.

Напишите, пожалуйста:

🚗 желаемую модель
💰 бюджет
📅 желаемый год
📍 город доставки
"""

    else:

        reply = """
Спасибо! 👍

Мы получили ваш запрос.

Чтобы подобрать подходящий автомобиль,
напишите:

🚗 модель
📅 год
💰 бюджет
📍 город

FULIFENG AUTO поможет подобрать автомобиль
напрямую из Китая.
"""

    await message.answer(reply)


# =========================================================
# START BOT
# =========================================================

async def main():

    init_db()

    logging.info(
        "FULIFENG AUTO CRM BOT started"
    )

    await dp.start_polling(bot)


if __name__ == "__main__":

    import asyncio

    asyncio.run(main())
