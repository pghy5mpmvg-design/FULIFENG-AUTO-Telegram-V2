import os
import logging
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, Command
from aiogram.types import ReplyKeyboardMarkup, KeyboardButton
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

logging.basicConfig(level=logging.INFO)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# =========================================================
# DATABASE
# =========================================================

def get_db():

    return psycopg2.connect(DATABASE_URL)


def init_db():

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    cursor.close()
    conn.close()


def create_customer(message):

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO customers
    (
        telegram_id,
        username,
        name,
        country
    )
    VALUES (%s, %s, %s, %s)

    ON CONFLICT (telegram_id)
    DO UPDATE SET
        username = EXCLUDED.username,
        name = EXCLUDED.name,
        updated_at = CURRENT_TIMESTAMP
    """, (
        message.from_user.id,
        message.from_user.username or "",
        message.from_user.first_name or "",
        "Россия"
    ))

    conn.commit()

    cursor.close()
    conn.close()


def update_customer(
    telegram_id,
    field,
    value
):

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

    query = f"""
        UPDATE customers
        SET {field} = %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = %s
    """

    cursor.execute(
        query,
        (
            value,
            telegram_id
        )
    )

    conn.commit()

    cursor.close()
    conn.close()


def get_customer(telegram_id):

    conn = get_db()

    cursor = conn.cursor(
        cursor_factory=RealDictCursor
    )

    cursor.execute("""
        SELECT *
        FROM customers
        WHERE telegram_id = %s
    """, (
        telegram_id,
    ))

    result = cursor.fetchone()

    cursor.close()
    conn.close()

    return result


def get_stats():

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT COUNT(*) FROM customers"
    )

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

    score = 0

    if customer.get("car"):
        score += 2

    if customer.get("year"):
        score += 1

    if customer.get("budget"):
        score += 2

    if customer.get("city"):
        score += 1

    if customer.get("quantity"):
        score += 1

    if customer.get("purchase_time"):

        purchase_time = customer["purchase_time"].lower()

        if (
            "сейчас" in purchase_time
            or "1 нед" in purchase_time
            or "1 неделю" in purchase_time
        ):
            score += 3

        else:
            score += 1

    if score >= 7:
        return "A"

    if score >= 4:
        return "B"

    return "C"


def refresh_grade(telegram_id):

    customer = get_customer(
        telegram_id
    )

    grade = calculate_grade(
        customer
    )

    update_customer(
        telegram_id,
        "grade",
        grade
    )

    return grade


# =========================================================
# MAIN MENU
# =========================================================

main_keyboard = ReplyKeyboardMarkup(
    keyboard=[
        [
            KeyboardButton(
                text="🚗 Подобрать автомобиль"
            ),
            KeyboardButton(
                text="💰 Узнать цену"
            )
        ],
        [
            KeyboardButton(
                text="📋 Мои требования"
            ),
            KeyboardButton(
                text="👨‍💼 Менеджер"
            )
        ]
    ],
    resize_keyboard=True
)


# =========================================================
# START
# =========================================================

@dp.message(CommandStart())
async def start_handler(
    message: types.Message
):

    create_customer(message)

    await message.answer(
        """
🇷🇺 Здравствуйте!

Добро пожаловать в FULIFENG AUTO 🇨🇳🚗

Мы помогаем покупать автомобили
напрямую из Китая с доставкой
в Россию и страны СНГ.

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

@dp.message(
    lambda message:
    message.text == "🚗 Подобрать автомобиль"
)
async def buy_car(
    message: types.Message
):

    create_customer(message)

    await message.answer(
        """
🚗 Отлично!

Давайте подберём автомобиль.

Напишите:

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

@dp.message(
    lambda message:
    message.text == "💰 Узнать цену"
)
async def price(
    message: types.Message
):

    create_customer(message)

    await message.answer(
        """
💰 Рассчитаем стоимость автомобиля
из Китая.

Напишите:

🚗 Марка и модель
📅 Год
⚙️ Комплектация
💰 Бюджет
📍 Город доставки
"""
    )


# =========================================================
# REQUIREMENTS
# =========================================================

@dp.message(
    lambda message:
    message.text == "📋 Мои требования"
)
async def requirements(
    message: types.Message
):

    create_customer(message)

    await message.answer(
        """
📋 Отправьте одним сообщением:

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

@dp.message(
    lambda message:
    message.text == "👨‍💼 Менеджер"
)
async def manager(
    message: types.Message
):

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
# STATS
# =========================================================

@dp.message(Command("stats"))
async def stats_handler(
    message: types.Message
):

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
# CUSTOMER MESSAGE
# =========================================================

@dp.message()
async def customer_message(
    message: types.Message
):

    create_customer(message)

    telegram_id = message.from_user.id

    text = message.text or ""

    update_customer(
        telegram_id,
        "last_message",
        text
    )

    lower_text = text.lower()

    # =====================================================
    # CITY
    # =====================================================

    cities = [
        "москва",
        "санкт-петербург",
        "владивосток",
        "екатеринбург",
        "новосибирск",
        "казань",
        "красноярск",
        "иркутск",
        "хабаровск",
        "омск",
        "самара",
        "ростов",
        "уфа",
        "пермь"
    ]

    for city in cities:

        if city in lower_text:

            update_customer(
                telegram_id,
                "city",
                city.title()
            )

            break

    # =====================================================
    # CAR
    # =====================================================

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
        "jetta",
        "tank",
        "exeed",
        "omoda"
    ]

    for car in car_keywords:

        if car in lower_text:

            update_customer(
                telegram_id,
                "car",
                text
            )

            break

    # =====================================================
    # QUANTITY
    # =====================================================

    quantity_words = [
        "2 авто",
        "3 авто",
        "5 авто",
        "10 авто",
        "оптом",
        "несколько автомобилей"
    ]

    if any(
        word in lower_text
        for word in quantity_words
    ):

        update_customer(
            telegram_id,
            "quantity",
            text
        )

    # =====================================================
    # AUTO GRADE
    # =====================================================

    grade = refresh_grade(
        telegram_id
    )

    # =====================================================
    # RESPONSE
    # =====================================================

    if grade == "A":

        reply = """
🔥 Спасибо!

Ваш запрос выглядит очень конкретным.

Мы можем быстро подобрать варианты
из Китая.

Отправьте:

🚗 модель
📅 год
💰 бюджет
📍 город доставки

После этого подготовим предложение.
"""

    elif grade == "B":

        reply = """
👍 Спасибо!

Мы можем подобрать несколько вариантов
из Китая под ваш бюджет.

Напишите:

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

FULIFENG AUTO поможет подобрать
автомобиль напрямую из Китая.
"""

    await message.answer(reply)


# =========================================================
# RUN
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
