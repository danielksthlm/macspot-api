import psycopg2
from config import REMOTE_DB_CONFIG

conn = psycopg2.connect(**REMOTE_DB_CONFIG)
cur = conn.cursor()
cur.execute("SELECT datname FROM pg_database;")
print(cur.fetchall())
conn.close()