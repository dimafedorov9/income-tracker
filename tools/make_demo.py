"""Выдуманные данные для демо-режима (demo.json). Реальных сумм здесь нет — файл можно публиковать."""
import json, random
from datetime import date
random.seed(7)
SOURCES = [
    ['d_job1', 'НИИ «Пример»', 'job', 'split', 15, 1, 0, 1, ''],
    ['d_job2', 'Школа №1', 'job', 'split', 15, 3, 0, 2, ''],
    ['d_side', 'Студия «Слайд»', 'side', 'paydate', 15, 4, 0, 3, 'Разовые заказы'],
    ['d_other', 'Прочее', 'other', 'paydate', 15, 5, 0, 4, ''],
]
CATS = [['dc1', 'd_job1', 'Зарплата', 1], ['dc2', 'd_job1', 'Премия', 2], ['dc3', 'd_job1', 'Отпускные', 3],
        ['dc4', 'd_job2', 'Зарплата', 1], ['dc5', 'd_side', 'Создание презентаций', 1], ['dc6', 'd_side', 'Вёрстка', 2],
        ['dc7', 'd_other', 'Налоговый вычет', 1], ['dc8', 'd_other', 'Кэшбэк', 2]]
pays, n = [], 0
def add(d, s, cat, amt, kind, acc, note=''):
    global n; n += 1
    pays.append([f'd{n}', d.isoformat(), s[0], s[1], cat, round(amt, 2), '', acc, kind, note, ''])
def acc_of(d, cut=15):
    if d.day <= cut:
        y, m = (d.year, d.month - 1) if d.month > 1 else (d.year - 1, 12)
    else: y, m = d.year, d.month
    return f'{y}-{m:02d}'
base1, base2 = 42000, 21000
for y in (2024, 2025, 2026):
    for m in range(1, 13):
        if (y, m) > (2026, 10): break
        g = 1 + 0.004 * ((y - 2024) * 12 + m)
        for s, base, d1, d2 in ((SOURCES[0], base1, 8, 23), (SOURCES[1], base2, 10, 25)):
            if s is SOURCES[1] and (y, m) < (2025, 9): continue
            a = date(y, m, d1); b = date(y, m, d2)
            add(a, s, 'Зарплата', base * g * random.uniform(0.55, 0.65), 'Остаток', acc_of(a))
            add(b, s, 'Зарплата', base * g * random.uniform(0.38, 0.45), 'Аванс', acc_of(b))
        if m == 12: add(date(y, 12, 26), SOURCES[0], 'Премия', base1 * random.uniform(0.8, 1.2), 'Аванс', f'{y}-12')
        if m == 7: add(date(y, 7, 3), SOURCES[0], 'Отпускные', base1 * 0.9, 'Остаток', acc_of(date(y, 7, 3)))
        if random.random() < 0.4:
            d = date(y, m, random.randint(1, 28)); add(d, SOURCES[2], random.choice(['Создание презентаций', 'Вёрстка']), random.choice([5000, 8000, 12000, 15000]), 'Разовая', f'{d.year}-{d.month:02d}')
add(date(2025, 4, 15), SOURCES[3], 'Налоговый вычет', 13000, 'Разовая', '2025-04', 'Вычет за обучение')
pays.sort(key=lambda p: p[1])
json.dump(dict(payments=pays, sources=SOURCES, categories=CATS), open('demo.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(pays), 'demo payments')
