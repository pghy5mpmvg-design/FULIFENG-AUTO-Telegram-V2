import os

import psycopg2
from psycopg2.extras import RealDictCursor

from flask import (
    Flask,
    render_template_string,
    request
)

from dotenv import load_dotenv


load_dotenv()


app = Flask(__name__)


DATABASE_URL = os.getenv("DATABASE_URL")

ADMIN_PASSWORD = os.getenv(
    "ADMIN_PASSWORD",
    "fulifeng2026"
)


if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set"
    )


# =========================================================
# DATABASE
# =========================================================

def get_db():

    return psycopg2.connect(
        DATABASE_URL
    )


# =========================================================
# HTML
# =========================================================

HTML = """

<!DOCTYPE html>

<html lang="ru">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>FULIFENG AUTO CRM</title>


<style>

body {

    font-family:
    Arial,
    sans-serif;

    background:
    #f3f5f7;

    margin:0;

    padding:20px;

}


.container {

    max-width:1500px;

    margin:auto;

}


h1 {

    margin-bottom:5px;

}


.subtitle {

    color:#777;

    margin-bottom:25px;

}


.stats {

    display:flex;

    gap:15px;

    flex-wrap:wrap;

    margin-bottom:25px;

}


.card {

    background:white;

    padding:20px;

    border-radius:12px;

    min-width:180px;

    box-shadow:
    0 2px 8px
    rgba(0,0,0,.08);

}


.card strong {

    display:block;

    font-size:32px;

    margin-top:8px;

}


.toolbar {

    background:white;

    padding:15px;

    border-radius:10px;

    margin-bottom:20px;

}


input,
select,
button {

    padding:10px;

    margin:5px;

    border:1px solid #ccc;

    border-radius:6px;

}


button {

    background:#20242a;

    color:white;

    cursor:pointer;

}


table {

    width:100%;

    border-collapse:collapse;

    background:white;

    border-radius:10px;

    overflow:hidden;

}


th {

    background:#20242a;

    color:white;

    padding:12px;

}


td {

    padding:11px;

    border-bottom:
    1px solid #eee;

}


.A {

    color:#d00000;

    font-weight:bold;

}


.B {

    color:#d98b00;

    font-weight:bold;

}


.C {

    color:#228b22;

    font-weight:bold;

}


.badge {

    padding:5px 9px;

    border-radius:15px;

    background:#eee;

}


.empty {

    background:white;

    padding:40px;

    text-align:center;

}


@media(max-width:900px) {

    body {

        padding:10px;

    }

    table {

        font-size:12px;

    }

    th,
    td {

        padding:7px;

    }

}

</style>

</head>


<body>


<div class="container">


<h1>

🚗 FULIFENG AUTO CRM

</h1>


<div class="subtitle">

Россия / СНГ — Customer Management System

</div>


<div class="stats">


<div class="card">

Всего клиентов

<strong>

{{ total }}

</strong>

</div>


<div class="card">

🔴 A — горячие

<strong>

{{ a }}

</strong>

</div>


<div class="card">

🟡 B — потенциальные

<strong>

{{ b }}

</strong>

</div>


<div class="card">

🟢 C — долгосрочные

<strong>

{{ c }}

</strong>

</div>


</div>



<div class="toolbar">


<form method="get">


<input

type="hidden"

name="password"

value="{{ password }}"

>


<input

type="text"

name="q"

placeholder="Поиск: имя / Telegram / авто / город"

value="{{ q }}"

>


<select name="grade">


<option value="">

Все клиенты

</option>


<option

value="A"

{% if grade == "A" %}
selected
{% endif %}

>

🔴 A

</option>


<option

value="B"

{% if grade == "B" %}
selected
{% endif %}

>

🟡 B

</option>


<option

value="C"

{% if grade == "C" %}
selected
{% endif %}

>

🟢 C

</option>


</select>


<button type="submit">

🔎 Поиск

</button>


</form>


</div>



{% if customers %}


<table>


<tr>

<th>ID</th>

<th>客户</th>

<th>Telegram</th>

<th>国家</th>

<th>城市</th>

<th>车型</th>

<th>年份</th>

<th>预算</th>

<th>数量</th>

<th>购买时间</th>

<th>等级</th>

<th>状态</th>

<th>最后消息</th>

</tr>



{% for c in customers %}


<tr>


<td>

{{ c.id }}

</td>


<td>

<strong>

{{ c.name or "-" }}

</strong>

</td>


<td>

{% if c.username %}

<a

href="https://t.me/{{ c.username }}"

target="_blank"

>

@{{ c.username }}

</a>

{% else %}

-

{% endif %}

</td>


<td>

{{ c.country or "-" }}

</td>


<td>

{{ c.city or "-" }}

</td>


<td>

{{ c.car or "-" }}

</td>


<td>

{{ c.year or "-" }}

</td>


<td>

{{ c.budget or "-" }}

</td>


<td>

{{ c.quantity or "-" }}

</td>


<td>

{{ c.purchase_time or "-" }}

</td>


<td class="{{ c.grade }}">

{{ c.grade }}

</td>


<td>

<span class="badge">

{{ c.status }}

</span>

</td>


<td>

{{ c.last_message or "-" }}

</td>


</tr>


{% endfor %}


</table>


{% else %}


<div class="empty">

暂无客户

</div>


{% endif %}


</div>


</body>

</html>

"""


# =========================================================
# STATISTICS
# =========================================================

def get_statistics():

    conn = get_db()

    cursor = conn.cursor()


    cursor.execute(
        "SELECT COUNT(*) FROM customers"
    )

    total = cursor.fetchone()[0]


    cursor.execute(
        """
        SELECT COUNT(*)
        FROM customers
        WHERE grade = 'A'
        """
    )

    a = cursor.fetchone()[0]


    cursor.execute(
        """
        SELECT COUNT(*)
        FROM customers
        WHERE grade = 'B'
        """
    )

    b = cursor.fetchone()[0]


    cursor.execute(
        """
        SELECT COUNT(*)
        FROM customers
        WHERE grade = 'C'
        """
    )

    c = cursor.fetchone()[0]


    cursor.close()

    conn.close()


    return total, a, b, c


# =========================================================
# CUSTOMER SEARCH
# =========================================================

def get_customers(
    q="",
    grade=""
):

    conn = get_db()


    cursor = conn.cursor(
        cursor_factory=RealDictCursor
    )


    sql = """

    SELECT *

    FROM customers

    WHERE 1=1

    """

    params = []


    if q:

        sql += """

        AND (

            name ILIKE %s

            OR username ILIKE %s

            OR car ILIKE %s

            OR city ILIKE %s

            OR budget ILIKE %s

            OR last_message ILIKE %s

        )

        """

        search = f"%{q}%"

        params.extend([
            search,
            search,
            search,
            search,
            search,
            search
        ])


    if grade:

        sql += """

        AND grade = %s

        """

        params.append(
            grade
        )


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


    cursor.execute(
        sql,
        params
    )


    customers = cursor.fetchall()


    cursor.close()

    conn.close()


    return customers


# =========================================================
# LOGIN + DASHBOARD
# =========================================================

@app.route("/")

def dashboard():

    password = request.args.get(
        "password",
        ""
    )


    if password != ADMIN_PASSWORD:

        return """

        <!DOCTYPE html>

        <html>

        <head>

        <meta charset="UTF-8">

        <title>FULIFENG CRM</title>

        </head>


        <body style="font-family:Arial;padding:50px">


        <h2>

        🚗 FULIFENG AUTO CRM

        </h2>


        <p>

        Администратор

        </p>


        <form>

        <input

        type="password"

        name="password"

        placeholder="Admin password"

        >


        <button>

        Войти

        </button>


        </form>


        </body>

        </html>

        """


    q = request.args.get(
        "q",
        ""
    )


    grade = request.args.get(
        "grade",
        ""
    )


    customers = get_customers(
        q,
        grade
    )


    total, a, b, c = get_statistics()


    return render_template_string(

        HTML,

        customers=customers,

        total=total,

        a=a,

        b=b,

        c=c,

        q=q,

        grade=grade,

        password=password

    )


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    port = int(
        os.getenv(
            "PORT",
            "8080"
        )
    )


    app.run(

        host="0.0.0.0",

        port=port

    )
