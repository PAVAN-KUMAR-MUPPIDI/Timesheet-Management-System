import os
import logging
from typing import Optional
import pyodbc
from dotenv import load_dotenv

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
_ENV_PATH = os.path.join(_BACKEND_DIR, '.env')
if os.path.exists(_ENV_PATH):
    load_dotenv(_ENV_PATH)
else:
    load_dotenv()

logger = logging.getLogger("app.db")

def get_odbc_connection_string() -> str:
    """
    Build ODBC Driver connection string dynamically from environment variables (.env / cloud config).
    Supports ODBC connection string or discrete DB_* parameters with Windows Auth / SQL Auth.
    """
    raw = os.getenv("RAW_CONNECTION_STRING", "")
    if raw and "DRIVER=" in raw.upper():
        return raw

    driver = os.getenv("DB_DRIVER", "ODBC Driver 18 for SQL Server")
    server = os.getenv("DB_SERVER", r"ACU-HYD-LT-1872\SQLEXPRESS")
    database = os.getenv("DB_NAME", "TeamProductivityHub")
    trusted = os.getenv("DB_TRUSTED_CONNECTION", "true").strip().lower() in ("true", "1", "yes")
    encrypt = os.getenv("DB_ENCRYPT", "true").strip().lower() in ("true", "1", "yes")
    trust_cert = os.getenv("DB_TRUST_SERVER_CERTIFICATE", "true").strip().lower() in ("true", "1", "yes")
    user = os.getenv("DB_USER", "sa")
    pwd = os.getenv("DB_PASSWORD", "")

    parts = [
        f"DRIVER={{{driver}}}",
        f"SERVER={server}",
        f"DATABASE={database}",
        "Trusted_Connection=yes" if trusted else f"UID={user};PWD={pwd}",
        f"Encrypt={'yes' if encrypt else 'no'}",
        f"TrustServerCertificate={'yes' if trust_cert else 'no'}",
        "Application Name=TeamProductivityHub",
    ]
    return ";".join(parts) + ";"

def create_db_connection() -> Optional[pyodbc.Connection]:
    """Attempts to establish a direct pyodbc connection to Microsoft SQL Server."""
    try:
        conn_str = get_odbc_connection_string()
        conn = pyodbc.connect(conn_str, timeout=10, autocommit=True)
        return conn
    except Exception as exc:
        logger.warning("Failed to connect to Microsoft SQL Server: %s", exc)
        return None

def test_sqlserver_connection() -> bool:
    """Quick connectivity test returning True if SQL Server is accessible."""
    conn = None
    try:
        conn = create_db_connection()
        if not conn:
            return False
        cur = conn.cursor()
        cur.execute("SELECT 1")
        row = cur.fetchone()
        return bool(row and row[0] == 1)
    except Exception as exc:
        logger.warning("SQL Server health check ping failed: %s", exc)
        return False
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass
