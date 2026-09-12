import os
import sqlite3
from flask import Flask, render_template_string, request, redirect

app = Flask(__name__)

DB_FILE = "customers.db"

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "fulifeng2026")


HTML = """
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>FULIFENG AUTO CRM</title>

    <style>

        body {
            font-family: Arial, sans-serif;
            background: #f4f6f8;
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: auto;
        }

        h1 {
            margin-bottom: 5px;
        }

        .subtitle {
            color: #666;
            margin-bottom: 25px;
        }

        .stats {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-bottom: 25px;
        }

        .card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            min-width: 180px;
            box-shadow: 0 2px 8px rgba(0,0,0,.08);
        }

        .card strong {
            display: block;
            font-size: 30px;
            margin-top: 8px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
        }

        th, td {
            padding: 12px;
            border-bottom: 1px solid #eee;
            text-align: left;
        }

        th {
            background: #20242a;
            color: white;
        }

        .A {
            color: #d00000;
            font-weight: bold;
        }

        .B {
            color: #d98b00;
            font-weight: bold;
        }

        .C {
            color: #228b22;
            font-weight: bold;
        }

        .search {
            margin-bottom: 20px;
        }

        input, select, button {
            padding: 10px;
            margin-right: 8px;
            border: 1px solid #ccc;
            border-radius: 6px;
        }

        button {
            cursor: pointer;
            background: #20242a;
            color: white;
        }

        .empty {
            padding: 30px;
            text-align: center;
            background: white;
        }

        @media(max-width:800px) {

            table {
                font-size: 12px;
            }

            th, td {
                padding: 7px;
            }

        }

    </style>
</head>

<body>

<div class="container">

    <h1>🚗 FULIFENG AUTO CRM</h1>

    <div class="subtitle">
        Россия / СНГ — Telegram Customer Management
    </div>

    <div class="stats">

        <div class="card">
            Всего клиентов
            <strong>{{ total }}</strong>
        </div>

        <div class="card">
            🔴 A — горячие
            <strong>{{ a }}</strong>
        </div>

        <div class="card">
            🟡 B — потенциальные
            <strong>{{ b }}</strong>
        </div>

        <div class="card">
            🟢 C — долгосрочные
            <strong>{{ c }}</strong>
        </div>

    </div>


    <form class="search" method="get">

        <input
            type="text"
            name="q"
            placeholder="Поиск клиента..."
            value="{{ q }}"
        >

        <select name="grade">

            <option value="">Все клиенты</option>

            <option value="A"
                {% if grade == "A" %}selected{% endif %}>
                A
            </option>

            <option value="B"
                {% if grade == "B" %}selected{% endif %}>
                B
            </option>

            <option value="C"
                {% if grade == "C" %}selected{% endif %}>
                C
            </option>

        </select>

        <button type="submit">
            Поиск
        </button>

    </form>


    {% if customers %}

    <table>

        <tr>

            <th>ID</th>
            <th>Имя</th>
            <th>Telegram</th>
            <th>Город</th>
            <th>Автомобиль</th>
            <th>Год</th>
            <th>Бюджет</th>
            <th>Количество</th>
            <th>Класс</th>
            <th>Статус</th>
            <th>Последнее сообщение</th>

        </tr>


        {% for c in customers %}

        <tr>

            <td>{{ c[0] }}</td>

            <td>{{ c[3] }}</td>

            <td>
                @{{ c[2] }}
            </td>

            <td>{{ c[5] or "-" }}</td>

            <td>{{ c[6] or "-" }}</td>

            <td>{{ c[7] or "-" }}</td>

            <td>{{ c[8] or "-" }}</td>

            <td>{{ c[9] or "-" }}</td>

            <td class="{{ c[11] }}">
                {{ c[11] }}
            </td>

            <td>{{ c[12] }}</td>

            <td>
                {{ c[13] or "-" }}
            </td>

        </tr>

        {% endfor %}

    </table>

    {% else %}

    <div class="empty">
        Клиенты пока не найдены.
    </div>

    {% endif %}

</div>

</body>
</html>
"""


def get_connection():

    return sqlite3.connect(DB_FILE)


def get_customers(q="", grade=""):

    conn = get_connection()

    cursor = conn.cursor()

    sql = """
        SELECT
            id,
            telegram_id,
            username,
            name,
            country,
            city,
            car,
            year,
            budget,
            quantity,
            purchase_time,
            grade,
            status,
            last_message,
            created_at,
            updated_at
        FROM customers
        WHERE 1=1
    """

    params = []

    if q:

        sql += """
            AND (
                name LIKE ?
                OR username LIKE ?
                OR car LIKE ?
                OR city LIKE ?
                OR budget LIKE ?
            )
        """

        search = f"%{q}%"

        params.extend([
            search,
            search,
            search,
            search,
            search
        ])

    if grade:

        sql += " AND grade = ?"

        params.append(grade)

    sql += """
        ORDER BY
            CASE grade
                WHEN 'A' THEN 1
                WHEN 'B' THEN 2
                WHEN 'C' THEN 3
                ELSE 4
            END,
            updated_at DESC
    """

    cursor.execute(sql, params)

    customers = cursor.fetchall()

    conn.close()

    return customers


def get_statistics():

    conn = get_connection()

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


@app.route("/")
def dashboard():

    password = request.args.get("password", "")

    if password != ADMIN_PASSWORD:

        return """
        <html>
        <body style="font-family:Arial;padding:40px">

        <h2>FULIFENG AUTO CRM</h2>

        <form>

        <input
            type="password"
            name="password"
            placeholder="Admin password"
        >

        <button type="submit">
            Login
        </button>

        </form>

        </body>
        </html>
        """

    q = request.args.get("q", "")

    grade = request.args.get("grade", "")

    customers = get_customers(q, grade)

    total, a, b, c = get_statistics()

    return render_template_string(
        HTML,
        customers=customers,
        total=total,
        a=a,
        b=b,
        c=c,
        q=q,
        grade=grade
    )


if __name__ == "__main__":

    port = int(
        os.getenv("PORT", 8080)
    )

    app.run(
        host="0.0.0.0",
        port=port
    )
