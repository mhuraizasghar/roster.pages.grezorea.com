import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Fetch variables
DATABASE_URL = os.getenv("DATABASE_URL")
SCHEMA_PATH = Path(__file__).parent / "supabase" / "migrations" / "001_eval_schema.sql"


def get_connection():
    """Create a PostgreSQL connection to Supabase using DATABASE_URL."""
    if not DATABASE_URL or "[YOUR-DATABASE-PASSWORD]" in DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is missing or still uses [YOUR-DATABASE-PASSWORD]. "
            "Set your Supabase database password in .env first."
        )
    return psycopg2.connect(DATABASE_URL)


def check_connection():
    """Verify database connectivity and print server version."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database(), current_user, version();")
            db, user, ver = cur.fetchone()
            print(f"Connected to database='{db}' as user='{user}'")
            print(f"PostgreSQL: {ver}")
    finally:
        conn.close()


def run_migration():
    """Apply supabase/migrations/001_eval_schema.sql to the connected database."""
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Migration file not found: {SCHEMA_PATH}")
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn = get_connection()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        print(f"Successfully applied migration: {SCHEMA_PATH.name}")
    finally:
        conn.close()


def seed_legacy_quizzes():
    """Import published quizzes from data/published.json into Supabase library tables."""
    pub_path = Path(__file__).parent / "data" / "published.json"
    if not pub_path.exists():
        print("No data/published.json found; skipping legacy import.")
        return

    bundle = json.loads(pub_path.read_text(encoding="utf-8"))
    quizzes = bundle.get("quizzes", [])
    if not quizzes:
        print("No quizzes in data/published.json.")
        return

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                # Ensure demo teacher profile exists
                cur.execute(
                    """
                    INSERT INTO public.users_profile (id, email, role, display_name, institution_name, auth_provider, email_verified)
                    VALUES ('11111111-1111-4111-8111-111111111111', 'teacher@eval.demo', 'teacher', 'Dr. Sarah Lin', 'Air University', 'email', true)
                    ON CONFLICT (email) DO NOTHING;
                    """
                )
                cur.execute(
                    "SELECT id FROM public.users_profile WHERE email = 'teacher@eval.demo';"
                )
                teacher_id = cur.fetchone()[0]

                for q in quizzes:
                    subject = q.get("subject") or "General"
                    cur.execute(
                        """
                        INSERT INTO public.folders (owner_id, name, is_subject)
                        SELECT %s, %s, true
                        WHERE NOT EXISTS (
                            SELECT 1 FROM public.folders WHERE owner_id = %s AND name = %s AND parent_id IS NULL AND deleted_at IS NULL
                        );
                        """,
                        (teacher_id, subject, teacher_id, subject),
                    )
                    cur.execute(
                        "SELECT id FROM public.folders WHERE owner_id = %s AND name = %s AND parent_id IS NULL LIMIT 1;",
                        (teacher_id, subject),
                    )
                    folder_id = cur.fetchone()[0]

                    for email in q.get("allowedEmails", []):
                        norm = email.strip().lower()
                        if "@" in norm and not norm.startswith("@"):
                            cur.execute(
                                """
                                INSERT INTO public.roster_entries (teacher_id, student_email, status)
                                VALUES (%s, %s, 'pending')
                                ON CONFLICT (teacher_id, student_email) DO NOTHING;
                                """,
                                (teacher_id, norm),
                            )

                print(f"Seeded teacher roster & subjects from {len(quizzes)} published quiz(zes).")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Roster Supabase PostgreSQL Utility")
    parser.add_argument("--check", action="store_true", help="Verify Supabase Postgres connection")
    parser.add_argument("--migrate", action="store_true", help="Apply SQL schema migration to Supabase")
    parser.add_argument("--seed", action="store_true", help="Seed demo teacher and published data")
    args = parser.parse_args()

    if not (args.check or args.migrate or args.seed):
        args.check = True

    try:
        if args.check:
            check_connection()
        if args.migrate:
            run_migration()
        if args.seed:
            seed_legacy_quizzes()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
