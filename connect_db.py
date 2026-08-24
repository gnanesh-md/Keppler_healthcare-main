#!/usr/bin/env python3
"""
PostgreSQL Database Connection and Query Tool
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import sys

# Database connection parameters
DB_PARAMS = {
    "host": "localhost",
    "port": 5432,
    "database": "hospai",
    "user": "hospai",
    "password": "hospai_secure_password"
}

def connect_db():
    """Connect to PostgreSQL database"""
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        print("✓ Connected to PostgreSQL successfully!")
        return conn
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        return None

def show_tables(conn):
    """List all tables in the database"""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name;
            """)
            tables = cur.fetchall()
            if tables:
                print("\n📊 Tables in 'hospai' database:")
                for i, (table,) in enumerate(tables, 1):
                    print(f"  {i}. {table}")
            else:
                print("No tables found in public schema")
    except Exception as e:
        print(f"Error fetching tables: {e}")

def show_table_schema(conn, table_name):
    """Show schema/columns of a specific table"""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = %s
                ORDER BY ordinal_position;
            """, (table_name,))
            columns = cur.fetchall()
            if columns:
                print(f"\n📋 Schema for table '{table_name}':")
                for col in columns:
                    nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
                    default = f" DEFAULT {col['column_default']}" if col['column_default'] else ""
                    print(f"  - {col['column_name']}: {col['data_type']} {nullable}{default}")
            else:
                print(f"Table '{table_name}' not found")
    except Exception as e:
        print(f"Error fetching schema: {e}")

def show_table_data(conn, table_name, limit=5):
    """Show sample data from a table"""
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"SELECT * FROM {table_name} LIMIT %s;", (limit,))
            rows = cur.fetchall()
            if rows:
                print(f"\n📈 First {limit} rows from '{table_name}':")
                for i, row in enumerate(rows, 1):
                    print(f"\n  Row {i}:")
                    for key, value in row.items():
                        print(f"    {key}: {value}")
            else:
                print(f"No data found in '{table_name}'")
    except Exception as e:
        print(f"Error fetching data: {e}")

def main():
    """Interactive database explorer"""
    conn = connect_db()
    if not conn:
        sys.exit(1)
    
    try:
        # Show version
        with conn.cursor() as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()[0]
            print(f"\n📌 PostgreSQL Version: {version.split(',')[0]}")
        
        # List tables
        show_tables(conn)
        
        # Interactive menu
        while True:
            print("\n" + "="*50)
            print("OPTIONS:")
            print("1. View table schema")
            print("2. View table data")
            print("3. Run custom SQL query")
            print("4. Exit")
            print("="*50)
            
            choice = input("\nSelect option (1-4): ").strip()
            
            if choice == "1":
                table = input("Enter table name: ").strip()
                show_table_schema(conn, table)
            
            elif choice == "2":
                table = input("Enter table name: ").strip()
                limit = input("Number of rows (default 5): ").strip()
                limit = int(limit) if limit.isdigit() else 5
                show_table_data(conn, table, limit)
            
            elif choice == "3":
                query = input("Enter SQL query: ").strip()
                try:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(query)
                        if cur.description:
                            rows = cur.fetchall()
                            print(f"\n✓ Query executed. Rows returned: {len(rows)}")
                            for i, row in enumerate(rows[:5], 1):
                                print(f"\nRow {i}:")
                                for key, value in row.items():
                                    print(f"  {key}: {value}")
                            if len(rows) > 5:
                                print(f"\n... and {len(rows) - 5} more rows")
                        else:
                            conn.commit()
                            print("✓ Query executed successfully")
                except Exception as e:
                    print(f"✗ Query error: {e}")
            
            elif choice == "4":
                break
            
            else:
                print("Invalid option")
    
    finally:
        conn.close()
        print("\n✓ Connection closed")

if __name__ == "__main__":
    main()
