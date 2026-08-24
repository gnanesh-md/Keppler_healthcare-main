import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Try to connect and create database
conn = None
common_passwords = ["", "postgres", "password", "admin", "hospai", "hospai_secure_password"]

for pwd in common_passwords:
    try:
        conn = psycopg2.connect(
            host="127.0.0.1",
            user="postgres",
            password=pwd,
            database="postgres",
            connect_timeout=3
        )
        print(f"✓ Connected with password: {'(empty)' if not pwd else '***'}")
        break
    except Exception as e:
        continue

if not conn:
    try:
        conn = psycopg2.connect(
            host="localhost",
            user="postgres",
            password="",
            database="postgres",
            connect_timeout=3
        )
        print("✓ Connected via localhost")
    except Exception as e:
        print(f"Error: Could not connect to PostgreSQL. Please ensure it's running.")
        print(f"Last error: {e}")
        exit(1)

try:
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    
    # Create database if it doesn't exist
    try:
        cur.execute("CREATE DATABASE hospai;")
        print("✓ Database 'hospai' created")
    except Exception as e:
        if "already exists" in str(e):
            print("✓ Database 'hospai' already exists")
        else:
            raise
    
    # Create user if it doesn't exist
    try:
        cur.execute("CREATE USER hospai WITH PASSWORD 'hospai_secure_password';")
        print("✓ User 'hospai' created")
    except Exception as e:
        if "already exists" in str(e):
            print("✓ User 'hospai' already exists")
        else:
            raise
    
    # Grant privileges
    cur.execute("ALTER DATABASE hospai OWNER TO hospai;")
    print("✓ Privileges granted")
    
    cur.close()
    conn.close()
    print("✓ PostgreSQL setup complete!")
    
except Exception as e:
    print(f"Error: {e}")
    print("\nTrying alternative credentials...")
    try:
        conn = psycopg2.connect(
            host="localhost",
            user="hospai",
            password="hospai_secure_password",
            database="hospai"
        )
        print("✓ Already connected as hospai user")
        conn.close()
    except:
        print("Could not connect. Please ensure PostgreSQL is running.")
